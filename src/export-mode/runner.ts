import { Effect } from "effect";
import { getComments, getPosts, getThreads } from "tieba.js";
import { createDb } from "../db/index.ts";
import type {
	tiebaForums,
	tiebaPosts,
	tiebaSubPosts,
	tiebaThreads,
	tiebaUsers,
} from "../db/schema/index.ts";
import { setupClient } from "../lib/sdk.ts";
import {
	contentToText,
	normalizeId,
	normalizeUser,
	toJsonRecord,
	unixSecondsToDate,
} from "../lib/tieba-normalize.ts";
import { type ExportTargetConfig, loadExportConfig } from "./config.ts";
import { RateLimiter } from "./rate-limit.ts";
import {
	type ExportCounters,
	ExportRepository,
	type TargetCounters,
} from "./repository.ts";

type ForumInsert = typeof tiebaForums.$inferInsert;
type UserInsert = typeof tiebaUsers.$inferInsert;
type ThreadInsert = typeof tiebaThreads.$inferInsert;
type PostInsert = typeof tiebaPosts.$inferInsert;
type SubPostInsert = typeof tiebaSubPosts.$inferInsert;
type ThreadPage = NonNullable<
	Effect.Effect.Success<ReturnType<typeof getThreads>>
>;
type ThreadInfo = ThreadPage["threadList"][number];
type PostPage = NonNullable<Effect.Effect.Success<ReturnType<typeof getPosts>>>;
type PostInfo = PostPage["postList"][number];
type SubPostInfo = NonNullable<PostInfo["subPostList"]>["subPostList"][number];
type NormalizableTiebaUser = Parameters<typeof normalizeUser>[0];

interface CrawlContext {
	jobId: string;
	repo: ExportRepository;
	limiter: RateLimiter;
	jobCounters: ExportCounters;
}

interface TargetResult {
	forumId?: string;
	counters: TargetCounters;
}

function emptyJobCounters(): ExportCounters {
	return {
		forumsDone: 0,
		threadsFound: 0,
		threadsStored: 0,
		postsStored: 0,
		subPostsStored: 0,
	};
}

function emptyTargetCounters(): TargetCounters {
	return {
		pagesScanned: 0,
		threadsFound: 0,
		threadsStored: 0,
		postsStored: 0,
		subPostsStored: 0,
	};
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
	page: ThreadPage | undefined,
	fallbackName: string,
): ForumInsert | null {
	const forum = page?.forum;
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

async function runLimited<T>(
	limiter: RateLimiter,
	effect: Effect.Effect<T, unknown, never>,
): Promise<T> {
	await limiter.wait();
	return Effect.runPromise(effect);
}

async function fetchAndStoreAllSubPosts(
	post: PostInfo,
	threadId: string,
	ctx: CrawlContext,
	target: ExportTargetConfig,
): Promise<number> {
	const postId = normalizeId(post.id);
	if (!postId || post.subPostNumber <= 0) return 0;

	let stored = 0;
	let totalPages = 1;
	for (
		let page = 1;
		page <= Math.min(totalPages, target.subPostPageLimit);
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
	}

	return stored;
}

async function fetchAndStoreThreadPosts(
	thread: ThreadInfo,
	forumId: string,
	ctx: CrawlContext,
	target: ExportTargetConfig,
): Promise<{ postsStored: number; subPostsStored: number }> {
	const threadId = normalizeId(thread.id);
	if (!threadId) return { postsStored: 0, subPostsStored: 0 };

	let postsStored = 0;
	let subPostsStored = 0;
	let totalPages = 1;
	for (
		let page = 1;
		page <= Math.min(totalPages, target.maxThreadPages);
		page++
	) {
		const data = await runLimited(
			ctx.limiter,
			getPosts(Number(threadId), page, {
				withComment: target.includeComments,
			}),
		);
		totalPages = Math.max(1, data?.page?.totalPage ?? 1);

		const users = usersFromTiebaUsers([
			...(data?.userList ?? []),
			...(data?.postList ?? []).map((post) => post.author),
			...(data?.postList ?? []).flatMap((post) =>
				(post.subPostList?.subPostList ?? []).map((subPost) => subPost.author),
			),
		]);
		await ctx.repo.upsertUsers(users);

		if (data?.forum) {
			await ctx.repo.upsertForums([
				{
					id: data.forum.id,
					name: data.forum.name,
					raw: toJsonRecord(data.forum),
				},
			]);
		}

		if (data?.thread) {
			const threadRow = threadToRow(data.thread, target, ctx.jobId, forumId);
			if (threadRow) await ctx.repo.upsertThreads([threadRow]);
		}

		const posts = data?.postList ?? [];
		const postRows = posts
			.map((post) => postToRow(post, threadId, forumId, ctx.jobId))
			.filter((row): row is PostInsert => !!row);
		postsStored += await ctx.repo.upsertPosts(postRows);

		if (target.includeComments) {
			subPostsStored += await ctx.repo.upsertSubPosts(
				collectEmbeddedSubPosts(posts, threadId, ctx.jobId),
			);
		}

		if (target.includeSubPosts) {
			for (const post of posts) {
				subPostsStored += await fetchAndStoreAllSubPosts(
					post,
					threadId,
					ctx,
					target,
				);
			}
		}
	}

	return { postsStored, subPostsStored };
}

async function crawlTarget(
	target: ExportTargetConfig,
	targetId: number,
	ctx: CrawlContext,
): Promise<TargetResult> {
	const counters = emptyTargetCounters();
	let stop = false;
	let resolvedForumId: string | undefined;
	const selectedThreads = new Map<string, ThreadInfo>();

	for (let page = 1; page <= target.maxForumPages && !stop; page++) {
		const data = await runLimited(
			ctx.limiter,
			getThreads({
				fname: target.forumName,
				page,
				sort: target.sort,
				rn: target.pageSize,
			}),
		);
		counters.pagesScanned = page;

		const forum = forumFromPage(data, target.forumName);
		if (forum) {
			resolvedForumId = forum.id;
			await ctx.repo.upsertForums([forum]);
		}
		await ctx.repo.upsertUsers(usersFromTiebaUsers(data?.userList ?? []));

		const timelineThreads = (data?.threadList ?? []).filter(
			(thread) => !thread.isTop,
		);
		for (const thread of data?.threadList ?? []) {
			const createTime = unixSecondsToDate(thread.createTime);
			if (!inTimeRange(createTime, target)) continue;
			const id = normalizeId(thread.id);
			if (!id) continue;
			selectedThreads.set(id, thread);
			if (target.maxThreads && selectedThreads.size >= target.maxThreads) {
				stop = true;
				break;
			}
		}

		counters.threadsFound = selectedThreads.size;
		await ctx.repo.updateTarget(targetId, "running", counters, resolvedForumId);

		const oldestVisible = timelineThreads.every((thread) =>
			isOlderThanStart(unixSecondsToDate(thread.createTime), target),
		);
		if (target.sort === 1 && timelineThreads.length > 0 && oldestVisible)
			stop = true;
		if (data?.page?.hasMore === 0) stop = true;
	}

	counters.threadsFound = selectedThreads.size;
	const forumId =
		resolvedForumId ??
		normalizeId(Array.from(selectedThreads.values())[0]?.fid) ??
		target.forumName;

	for (const thread of selectedThreads.values()) {
		const threadRow = threadToRow(thread, target, ctx.jobId, forumId);
		if (!threadRow) continue;

		counters.threadsStored += await ctx.repo.upsertThreads([threadRow]);
		const postResult = await fetchAndStoreThreadPosts(
			thread,
			forumId,
			ctx,
			target,
		);
		counters.postsStored += postResult.postsStored;
		counters.subPostsStored += postResult.subPostsStored;
		await ctx.repo.updateTarget(targetId, "running", counters, forumId);
	}

	return { forumId, counters };
}

export async function runExportMode(): Promise<void> {
	const config = await loadExportConfig();
	setupClient(config.bduss);

	const client = createDb(config.databaseUrl);
	const repo = new ExportRepository(client.db);
	const limiter = new RateLimiter(config.rate.minIntervalMs);
	const jobCounters = emptyJobCounters();
	const jobId = await repo.createJob(config);
	const ctx: CrawlContext = { jobId, repo, limiter, jobCounters };

	try {
		for (const target of config.targets) {
			const targetId = await repo.createTarget(jobId, target);
			try {
				const result = await crawlTarget(target, targetId, ctx);
				jobCounters.forumsDone += 1;
				jobCounters.threadsFound += result.counters.threadsFound;
				jobCounters.threadsStored += result.counters.threadsStored;
				jobCounters.postsStored += result.counters.postsStored;
				jobCounters.subPostsStored += result.counters.subPostsStored;
				await repo.updateTarget(
					targetId,
					"completed",
					result.counters,
					result.forumId,
				);
				await repo.updateJob(jobId, jobCounters);
			} catch (err) {
				await repo.updateTarget(
					targetId,
					"failed",
					emptyTargetCounters(),
					undefined,
					err instanceof Error ? err.message : String(err),
				);
				throw err;
			}
		}

		await repo.finishJob(jobId, "completed", jobCounters);
	} catch (err) {
		await repo.finishJob(
			jobId,
			"failed",
			jobCounters,
			err instanceof Error ? err.message : String(err),
		);
		throw err;
	} finally {
		await client.pool.end();
	}
}
