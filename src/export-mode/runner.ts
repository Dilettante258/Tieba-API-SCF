/**
 * Export mode 是面向 Docker 多实例的语料采集 worker。
 * 所有实例共享同一个 PostgreSQL，通过 job/target/thread task 状态协同。
 * worker 优先消费 thread task；没有可消费任务时，抢一个 target producer lease。
 * producer 扫描贴吧列表页并持续补充 thread task，consumer 负责抓主题帖和回复。
 * 重启后只会从 DB 中的断点继续；重复抓取依赖内容表 upsert 保持幂等。
 */
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { setTimeout as sleep } from "node:timers/promises";
import type { Effect } from "effect";
import { getComments, getPosts } from "tieba.js";
import { createDb } from "../db/index.ts";
import type {
	tiebaForums,
	tiebaPosts,
	tiebaSubPosts,
	tiebaThreads,
	tiebaUsers,
} from "../db/schema/index.ts";
import {
	type ForumThreadInfo,
	type ForumThreadPageSnapshot,
	fetchForumThreadPage,
} from "../lib/forum-threads.ts";
import {
	makeRateLimiter,
	type RateLimiter,
	runLimited,
} from "../lib/rate-limit.ts";
import { ExportMailNotifier } from "./mail-notifier.ts";
import { setupClient } from "../lib/sdk.ts";
import {
	contentToText,
	normalizeId,
	normalizeUser,
	toJsonRecord,
	unixSecondsToDate,
} from "../lib/tieba-normalize.ts";
import { type ExportTargetConfig, loadExportConfig } from "./config.ts";
import {
	type ClaimedForumPageTask,
	type ClaimedThreadTask,
	ExportRepository,
	type ThreadTaskSeed,
} from "./repository.ts";

type ForumInsert = typeof tiebaForums.$inferInsert;
type UserInsert = typeof tiebaUsers.$inferInsert;
type ThreadInsert = typeof tiebaThreads.$inferInsert;
type PostInsert = typeof tiebaPosts.$inferInsert;
type SubPostInsert = typeof tiebaSubPosts.$inferInsert;
type ThreadInfo = ForumThreadInfo;
type PostPage = NonNullable<Effect.Effect.Success<ReturnType<typeof getPosts>>>;
type PostInfo = PostPage["postList"][number];
type SubPostInfo = NonNullable<PostInfo["subPostList"]>["subPostList"][number];
type NormalizableTiebaUser = Parameters<typeof normalizeUser>[0];

interface CrawlContext {
	jobId: string;
	repo: ExportRepository;
	limiter: RateLimiter;
	instanceId: string;
	leaseSeconds: number;
	maxTaskAttempts: number;
	maxScanAttempts: number;
	shouldStop: () => boolean;
}

function getInstanceId(): string {
	return (
		process.env.EXPORT_INSTANCE_ID ??
		`${hostname()}:${process.pid}:${randomUUID()}`
	);
}

function inTimeRange(date: Date | null, target: ExportTargetConfig): boolean {
	return !!date && date >= target.startTime && date <= target.endTime;
}

function isOlderThanStart(
	date: Date | null,
	target: ExportTargetConfig,
): boolean {
	return !!date && date < target.startTime;
}

function forumFromPage(
	page: ForumThreadPageSnapshot,
	fallbackName: string,
): ForumInsert | null {
	const forum = page.forum;
	const id = normalizeId(forum?.id);
	if (!id) return null;
	return {
		id,
		name: forum?.name || fallbackName,
		raw: toJsonRecord(forum),
	};
}

function usersFromTiebaUsers(users: NormalizableTiebaUser[]): UserInsert[] {
	const rows: UserInsert[] = [];
	for (const user of users) {
		const normalized = normalizeUser(user);
		if (normalized) rows.push(normalized);
	}
	return rows;
}

function threadToRow(
	thread: ThreadInfo,
	target: ExportTargetConfig,
	jobId: string,
	fallbackForumId?: string,
): ThreadInsert | null {
	const id = normalizeId(thread.id);
	const forumId = normalizeId(thread.fid) ?? fallbackForumId;
	if (!id || !forumId) return null;

	return {
		id,
		forumId,
		forumName: thread.fname || target.forumName,
		title: thread.title,
		authorId: normalizeId(thread.authorId),
		firstPostId: normalizeId(thread.firstPostId),
		replyNum: thread.replyNum,
		viewNum: thread.viewNum,
		shareNum: thread.shareNum,
		isGood: Boolean(thread.isGood),
		isTop: Boolean(thread.isTop),
		createTime: unixSecondsToDate(thread.createTime),
		lastReplyTime: unixSecondsToDate(thread.lastTimeInt),
		firstPostText: contentToText(thread.firstPostContent),
		raw: toJsonRecord(thread),
		sourceJobId: jobId,
	};
}

function postToRow(
	post: PostInfo,
	threadId: string,
	forumId: string,
	jobId: string,
): PostInsert | null {
	const id = normalizeId(post.id);
	if (!id) return null;

	return {
		id,
		threadId: normalizeId(post.tid) ?? threadId,
		forumId,
		floor: post.floor,
		authorId: normalizeId(post.authorId),
		contentText: contentToText(post.content),
		createTime: unixSecondsToDate(post.time),
		subPostNumber: post.subPostNumber,
		agreeNum: Number(post.agree?.agreeNum ?? 0),
		disagreeNum: Number(post.agree?.disagreeNum ?? 0),
		raw: toJsonRecord(post),
		sourceJobId: jobId,
	};
}

function subPostToRow(
	subPost: SubPostInfo,
	threadId: string,
	postId: string,
	jobId: string,
): SubPostInsert | null {
	const id = normalizeId(subPost.id);
	if (!id) return null;

	return {
		id,
		threadId,
		postId,
		floor: subPost.floor,
		authorId: normalizeId(subPost.authorId),
		contentText: contentToText(subPost.content),
		createTime: unixSecondsToDate(subPost.time),
		agreeNum: Number(subPost.agree?.agreeNum ?? 0),
		raw: toJsonRecord(subPost),
		sourceJobId: jobId,
	};
}

function collectEmbeddedSubPosts(
	posts: PostInfo[],
	threadId: string,
	jobId: string,
): SubPostInsert[] {
	const rows: SubPostInsert[] = [];
	for (const post of posts) {
		const postId = normalizeId(post.id);
		if (!postId) continue;
		for (const subPost of post.subPostList?.subPostList ?? []) {
			const row = subPostToRow(subPost, threadId, postId, jobId);
			if (row) rows.push(row);
		}
	}
	return rows;
}

function threadTaskFromInfo(
	thread: ThreadInfo,
	target: ExportTargetConfig,
	forumId: string,
): ThreadTaskSeed | null {
	const threadId = normalizeId(thread.id);
	if (!threadId) return null;
	return {
		threadId,
		forumId: normalizeId(thread.fid) ?? forumId,
		forumName: thread.fname || target.forumName,
		title: thread.title || "",
		rawThread: toJsonRecord(thread),
	};
}

async function fetchAndStoreAllSubPosts(
	post: PostInfo,
	threadId: string,
	taskId: string,
	ctx: CrawlContext,
	target: ExportTargetConfig,
): Promise<number> {
	const postId = normalizeId(post.id);
	if (!postId || post.subPostNumber <= 0) return 0;

	let stored = 0;
	let totalPages = 1;
	for (
		let page = 1;
		page <= Math.min(totalPages, target.activeSubPostPageLimit) &&
		!ctx.shouldStop();
		page++
	) {
		const data = await runLimited(
			ctx.limiter,
			getComments({ tid: Number(threadId), pid: Number(postId), pn: page }),
		);
		totalPages = Math.max(1, data?.page?.totalPage ?? 1);
		await ctx.repo.upsertUsers(
			usersFromTiebaUsers(
				(data?.subpostList ?? []).map((subPost) => subPost.author),
			),
		);
		const rows = (data?.subpostList ?? [])
			.map((subPost) => subPostToRow(subPost, threadId, postId, ctx.jobId))
			.filter((row): row is SubPostInsert => !!row);
		stored += await ctx.repo.upsertSubPosts(rows);
		const ok = await ctx.repo.extendThreadTaskLease(
			taskId,
			ctx.instanceId,
			ctx.leaseSeconds,
		);
		if (!ok) throw new Error(`Thread task lease lost: ${threadId}`);
	}

	return stored;
}

async function storePostPage(
	task: ClaimedThreadTask,
	target: ExportTargetConfig,
	data: PostPage | undefined,
	ctx: CrawlContext,
): Promise<{
	postsStored: number;
	subPostsStored: number;
	totalPages: number;
	interrupted: boolean;
}> {
	const totalPages = Math.max(
		1,
		data?.page?.totalPage ?? task.totalPostPages ?? 1,
	);
	const users = usersFromTiebaUsers([
		...(data?.userList ?? []),
		...(data?.postList ?? []).map((post) => post.author),
		...(data?.postList ?? []).flatMap((post) =>
			(post.subPostList?.subPostList ?? []).map((subPost) => subPost.author),
		),
	]);
	await ctx.repo.upsertUsers(users);

	if (data?.forum) {
		const forumId = normalizeId(data.forum.id);
		if (forumId) {
			await ctx.repo.upsertForums([
				{
					id: forumId,
					name: data.forum.name,
					raw: toJsonRecord(data.forum),
				},
			]);
		}
	}

	if (data?.thread) {
		const threadRow = threadToRow(data.thread, target, ctx.jobId, task.forumId);
		if (threadRow) await ctx.repo.upsertThreads([threadRow]);
	}

	const posts = data?.postList ?? [];
	const postRows = posts
		.map((post) => postToRow(post, task.threadId, task.forumId, ctx.jobId))
		.filter((row): row is PostInsert => !!row);
	const postsStored = await ctx.repo.upsertPosts(postRows);

	let subPostsStored = 0;
	if (target.includeComments) {
		const embeddedSubPostsStored = await ctx.repo.upsertSubPosts(
			collectEmbeddedSubPosts(posts, task.threadId, ctx.jobId),
		);
		if (!target.activeSubPostFetch) subPostsStored += embeddedSubPostsStored;
	}

	if (target.activeSubPostFetch) {
		for (const post of posts) {
			if (ctx.shouldStop()) {
				return { postsStored, subPostsStored, totalPages, interrupted: true };
			}
			subPostsStored += await fetchAndStoreAllSubPosts(
				post,
				task.threadId,
				task.id,
				ctx,
				target,
			);
			if (ctx.shouldStop()) {
				return { postsStored, subPostsStored, totalPages, interrupted: true };
			}
		}
	}

	return { postsStored, subPostsStored, totalPages, interrupted: false };
}

async function consumeThreadTask(
	task: ClaimedThreadTask,
	target: ExportTargetConfig,
	ctx: CrawlContext,
): Promise<void> {
	try {
		const rawThread = task.rawThread as unknown as ThreadInfo;
		const threadRow = threadToRow(rawThread, target, ctx.jobId, task.forumId);
		if (threadRow) await ctx.repo.upsertThreads([threadRow]);

		let totalPages = Math.max(1, task.totalPostPages || 1);
		for (
			let page = Math.max(1, task.nextPostPage);
			page <= Math.min(totalPages, target.maxThreadPages) && !ctx.shouldStop();
			page++
		) {
			const data = await runLimited(
				ctx.limiter,
				getPosts(Number(task.threadId), page, {
					withComment: target.includeComments,
				}),
			);
			const result = await storePostPage(task, target, data, ctx);
			totalPages = result.totalPages;
			if (result.interrupted || ctx.shouldStop()) {
				await ctx.repo.releaseThreadTask(task.id, ctx.instanceId, "shutdown");
				return;
			}

			const ok = await ctx.repo.updateThreadTaskProgress(
				task.id,
				ctx.instanceId,
				{
					nextPostPage: page + 1,
					totalPostPages: totalPages,
					postsStoredDelta: result.postsStored,
					subPostsStoredDelta: result.subPostsStored,
					leaseSeconds: ctx.leaseSeconds,
				},
			);
			if (!ok) throw new Error(`Thread task lease lost: ${task.threadId}`);
		}

		if (ctx.shouldStop()) {
			await ctx.repo.releaseThreadTask(task.id, ctx.instanceId, "shutdown");
			return;
		}

		await ctx.repo.completeThreadTask(task.id, ctx.instanceId);
	} catch (err) {
		if (ctx.shouldStop()) {
			await ctx.repo.releaseThreadTask(task.id, ctx.instanceId, err);
			return;
		}

		await ctx.repo.failThreadTask(
			task.id,
			ctx.instanceId,
			ctx.maxTaskAttempts,
			err,
		);
		console.error(
			`Failed to crawl thread task ${task.threadId}:`,
			err instanceof Error ? err.message : err,
		);
	}
}

function assertUsableForumPage(
	data: ForumThreadPageSnapshot,
	target: ExportTargetConfig,
	page: number,
): void {
	if (data.threadList.length === 0 && data.hasMore) {
		throw new Error(
			`Abnormal empty forum page: ${target.forumName} page ${page} reports hasMore`,
		);
	}
}

function stopAfterPage(
	data: ForumThreadPageSnapshot,
	target: ExportTargetConfig,
	page: number,
): number | undefined {
	if (!data.hasMore) return page;
	const oldestVisible =
		data.timelineThreads.length > 0 &&
		data.timelineThreads.every((thread) =>
			isOlderThanStart(unixSecondsToDate(thread.createTime), target),
		);
	if (target.sort === 1 && oldestVisible) return page;
	return undefined;
}

// Page scan tasks only discover thread tasks. Thread bodies are crawled by
// thread consumers, so a huge forum can spread list scanning across containers.
async function scanForumPageTask(
	target: ExportTargetConfig,
	task: ClaimedForumPageTask,
	ctx: CrawlContext,
): Promise<void> {
	try {
		const data = await fetchForumThreadPage({
			fname: target.forumName,
			page: task.page,
			sort: target.sort,
			pageSize: target.pageSize,
			limiter: ctx.limiter,
		});
		assertUsableForumPage(data, target, task.page);

		if (ctx.shouldStop()) {
			await ctx.repo.releaseForumPageTask(task.id, ctx.instanceId, "shutdown");
			return;
		}

		let resolvedForumId = task.forumId ?? target.forumName;
		const forum = forumFromPage(data, target.forumName);
		if (forum) {
			resolvedForumId = forum.id;
			await ctx.repo.upsertForums([forum]);
		}
		await ctx.repo.upsertUsers(usersFromTiebaUsers(data.userList));

		const tasks: ThreadTaskSeed[] = [];
		for (const thread of data.timelineThreads) {
			const createTime = unixSecondsToDate(thread.createTime);
			if (!inTimeRange(createTime, target)) continue;
			const seed = threadTaskFromInfo(thread, target, resolvedForumId);
			if (seed) tasks.push(seed);
		}

		await ctx.repo.completeForumPageTask(task.id, ctx.instanceId, {
			forumId: resolvedForumId,
			maxThreads: target.maxThreads,
			stopAfterPage: stopAfterPage(data, target, task.page),
			tasks,
		});
	} catch (err) {
		if (ctx.shouldStop()) {
			await ctx.repo.releaseForumPageTask(task.id, ctx.instanceId, err);
			return;
		}

		await ctx.repo.failForumPageTask(
			task.id,
			ctx.instanceId,
			ctx.maxScanAttempts,
			err,
		);
		console.error(
			`Failed to scan forum page ${target.forumName}#${task.page}:`,
			err instanceof Error ? err.message : err,
		);
	}
}

// Export mode 入口只装配配置、SDK、DB 和 worker 循环；具体协调逻辑留在 Repository。
export async function runExportMode(): Promise<void> {
	const config = await loadExportConfig();
	setupClient(config.bduss);

	const client = createDb(config.databaseUrl);
	const repo = new ExportRepository(client.db);
	const limiter = await makeRateLimiter(config.rate.minIntervalMs);
	const instanceId = getInstanceId();
	const notifier = new ExportMailNotifier(repo, instanceId);
	let stopping = false;
	const stop = () => {
		stopping = true;
	};

	process.once("SIGINT", stop);
	process.once("SIGTERM", stop);

	try {
		const jobId = await repo.ensureJob(config, instanceId);
		await repo.ensureJobNotification(jobId, config.notify);
		const targetById = new Map<number, ExportTargetConfig>();
		for (const target of config.targets) {
			const targetId = await repo.ensureTarget(jobId, target);
			targetById.set(targetId, target);
		}
		await notifier.notifyStarted(jobId);

		const ctx: CrawlContext = {
			jobId,
			repo,
			limiter,
			instanceId,
			leaseSeconds: config.worker.leaseSeconds,
			maxTaskAttempts: config.worker.maxTaskAttempts,
			maxScanAttempts: config.worker.maxScanAttempts,
			shouldStop: () => stopping,
		};

		while (!stopping) {
			await repo.updateJobHeartbeat(jobId, instanceId);

			let consumedTask = false;
			for (let i = 0; i < config.worker.claimBatchSize && !stopping; i++) {
				const task = await repo.claimThreadTask(
					jobId,
					instanceId,
					config.worker.leaseSeconds,
					config.worker.maxTaskAttempts,
				);
				if (!task) break;

				consumedTask = true;
				const target = targetById.get(task.targetId);
				if (!target) {
					await repo.failThreadTask(
						task.id,
						instanceId,
						config.worker.maxTaskAttempts,
						new Error(`Missing target config for target ${task.targetId}`),
					);
					continue;
				}
				await consumeThreadTask(task, target, ctx);
				await notifier.notifyProgress(jobId);
			}
			if (consumedTask) continue;

			let scannedPage = false;
			for (let i = 0; i < config.worker.claimBatchSize && !stopping; i++) {
				const pageTask = await repo.claimForumPageTask(
					jobId,
					instanceId,
					config.worker.leaseSeconds,
					config.worker.maxScanAttempts,
				);
				if (!pageTask) break;

				scannedPage = true;
				const target = targetById.get(pageTask.targetId);
				if (!target) {
					await repo.failForumPageTask(
						pageTask.id,
						instanceId,
						config.worker.maxScanAttempts,
						new Error(`Missing target config for target ${pageTask.targetId}`),
					);
					continue;
				}
				await scanForumPageTask(target, pageTask, ctx);
				await notifier.notifyProgress(jobId);
			}
			if (scannedPage) continue;

			await repo.refreshJobSummary(jobId);
			const state = await repo.getJobRunState(jobId);
			if (state.failed) {
				const message = state.errorMessage ?? "Export job failed";
				await repo.finishJob(jobId, "failed", message);
				await notifier.notifyFailed(jobId);
				throw new Error(message);
			}
			if (state.completed) {
				await repo.finishJob(jobId, "completed");
				await notifier.notifyCompleted(jobId);
				break;
			}

			await sleep(config.worker.idlePollMs);
		}

		if (stopping) await repo.refreshJobSummary(jobId);
	} finally {
		process.off("SIGINT", stop);
		process.off("SIGTERM", stop);
		await limiter.close();
		await client.pool.end();
	}
}
