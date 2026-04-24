import { eq, sql } from "drizzle-orm";
import type { TiebaDb } from "../db/index.ts";
import {
	exportJobs,
	exportTargets,
	tiebaForums,
	tiebaPosts,
	tiebaSubPosts,
	tiebaThreads,
	tiebaUsers,
} from "../db/schema/index.ts";
import type { ExportConfig, ExportTargetConfig } from "./config.ts";

type ForumInsert = typeof tiebaForums.$inferInsert;
type UserInsert = typeof tiebaUsers.$inferInsert;
type ThreadInsert = typeof tiebaThreads.$inferInsert;
type PostInsert = typeof tiebaPosts.$inferInsert;
type SubPostInsert = typeof tiebaSubPosts.$inferInsert;

export interface ExportCounters {
	forumsDone: number;
	threadsFound: number;
	threadsStored: number;
	postsStored: number;
	subPostsStored: number;
}

export interface TargetCounters {
	pagesScanned: number;
	threadsFound: number;
	threadsStored: number;
	postsStored: number;
	subPostsStored: number;
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
	const map = new Map<string, T>();
	for (const row of rows) map.set(row.id, row);
	return Array.from(map.values());
}

function publicJobConfig(config: ExportConfig): Record<string, unknown> {
	return {
		name: config.name,
		rate: config.rate,
		targets: config.targets.map((target) => ({
			forumName: target.forumName,
			startTime: target.startTime.toISOString(),
			endTime: target.endTime.toISOString(),
			sort: target.sort,
			pageSize: target.pageSize,
			maxForumPages: target.maxForumPages,
			maxThreadPages: target.maxThreadPages,
			maxThreads: target.maxThreads,
			includeComments: target.includeComments,
			includeSubPosts: target.includeSubPosts,
			subPostPageLimit: target.subPostPageLimit,
		})),
	};
}

export class ExportRepository {
	constructor(private readonly db: TiebaDb) {}

	async createJob(config: ExportConfig): Promise<string> {
		const [job] = await this.db
			.insert(exportJobs)
			.values({
				name: config.name,
				status: "running",
				config: publicJobConfig(config),
				forumsTotal: config.targets.length,
			})
			.returning({ id: exportJobs.id });

		return job.id;
	}

	async finishJob(
		jobId: string,
		status: "completed" | "failed",
		counters: ExportCounters,
		errorMessage?: string,
	): Promise<void> {
		await this.db
			.update(exportJobs)
			.set({
				status,
				errorMessage,
				forumsDone: counters.forumsDone,
				threadsFound: counters.threadsFound,
				threadsStored: counters.threadsStored,
				postsStored: counters.postsStored,
				subPostsStored: counters.subPostsStored,
				finishedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(exportJobs.id, jobId));
	}

	async updateJob(jobId: string, counters: ExportCounters): Promise<void> {
		await this.db
			.update(exportJobs)
			.set({
				forumsDone: counters.forumsDone,
				threadsFound: counters.threadsFound,
				threadsStored: counters.threadsStored,
				postsStored: counters.postsStored,
				subPostsStored: counters.subPostsStored,
				updatedAt: new Date(),
			})
			.where(eq(exportJobs.id, jobId));
	}

	async createTarget(
		jobId: string,
		target: ExportTargetConfig,
	): Promise<number> {
		const [row] = await this.db
			.insert(exportTargets)
			.values({
				jobId,
				forumName: target.forumName,
				startTime: target.startTime,
				endTime: target.endTime,
				status: "running",
			})
			.returning({ id: exportTargets.id });

		return row.id;
	}

	async updateTarget(
		id: number,
		status: "running" | "completed" | "failed",
		counters: TargetCounters,
		forumId?: string,
		errorMessage?: string,
	): Promise<void> {
		await this.db
			.update(exportTargets)
			.set({
				status,
				forumId,
				errorMessage,
				pagesScanned: counters.pagesScanned,
				threadsFound: counters.threadsFound,
				threadsStored: counters.threadsStored,
				postsStored: counters.postsStored,
				subPostsStored: counters.subPostsStored,
				finishedAt: status === "running" ? undefined : new Date(),
				updatedAt: new Date(),
			})
			.where(eq(exportTargets.id, id));
	}

	async upsertForums(rows: ForumInsert[]): Promise<number> {
		const values = dedupeById(
			rows.filter((row): row is ForumInsert & { id: string } => !!row.id),
		);
		if (values.length === 0) return 0;

		await this.db
			.insert(tiebaForums)
			.values(values)
			.onConflictDoUpdate({
				target: tiebaForums.id,
				set: {
					name: sql`excluded.name`,
					raw: sql`excluded.raw`,
					updatedAt: new Date(),
				},
			});
		return values.length;
	}

	async upsertUsers(rows: UserInsert[]): Promise<number> {
		const values = dedupeById(
			rows.filter((row): row is UserInsert & { id: string } => !!row.id),
		);
		if (values.length === 0) return 0;

		await this.db
			.insert(tiebaUsers)
			.values(values)
			.onConflictDoUpdate({
				target: tiebaUsers.id,
				set: {
					name: sql`excluded.name`,
					nameShow: sql`excluded.name_show`,
					portrait: sql`excluded.portrait`,
					tiebaUid: sql`excluded.tieba_uid`,
					ipAddress: sql`excluded.ip_address`,
					levelId: sql`excluded.level_id`,
					raw: sql`excluded.raw`,
					updatedAt: new Date(),
				},
			});
		return values.length;
	}

	async upsertThreads(rows: ThreadInsert[]): Promise<number> {
		const values = dedupeById(
			rows.filter((row): row is ThreadInsert & { id: string } => !!row.id),
		);
		if (values.length === 0) return 0;

		await this.db
			.insert(tiebaThreads)
			.values(values)
			.onConflictDoUpdate({
				target: tiebaThreads.id,
				set: {
					forumId: sql`excluded.forum_id`,
					forumName: sql`excluded.forum_name`,
					title: sql`excluded.title`,
					authorId: sql`excluded.author_id`,
					firstPostId: sql`excluded.first_post_id`,
					replyNum: sql`excluded.reply_num`,
					viewNum: sql`excluded.view_num`,
					shareNum: sql`excluded.share_num`,
					isGood: sql`excluded.is_good`,
					isTop: sql`excluded.is_top`,
					createTime: sql`excluded.create_time`,
					lastReplyTime: sql`excluded.last_reply_time`,
					firstPostText: sql`excluded.first_post_text`,
					raw: sql`excluded.raw`,
					sourceJobId: sql`excluded.source_job_id`,
					lastFetchedAt: new Date(),
				},
			});
		return values.length;
	}

	async upsertPosts(rows: PostInsert[]): Promise<number> {
		const values = dedupeById(
			rows.filter((row): row is PostInsert & { id: string } => !!row.id),
		);
		if (values.length === 0) return 0;

		await this.db
			.insert(tiebaPosts)
			.values(values)
			.onConflictDoUpdate({
				target: tiebaPosts.id,
				set: {
					threadId: sql`excluded.thread_id`,
					forumId: sql`excluded.forum_id`,
					floor: sql`excluded.floor`,
					authorId: sql`excluded.author_id`,
					contentText: sql`excluded.content_text`,
					createTime: sql`excluded.create_time`,
					subPostNumber: sql`excluded.sub_post_number`,
					agreeNum: sql`excluded.agree_num`,
					disagreeNum: sql`excluded.disagree_num`,
					raw: sql`excluded.raw`,
					sourceJobId: sql`excluded.source_job_id`,
					updatedAt: new Date(),
				},
			});
		return values.length;
	}

	async upsertSubPosts(rows: SubPostInsert[]): Promise<number> {
		const values = dedupeById(
			rows.filter((row): row is SubPostInsert & { id: string } => !!row.id),
		);
		if (values.length === 0) return 0;

		await this.db
			.insert(tiebaSubPosts)
			.values(values)
			.onConflictDoUpdate({
				target: tiebaSubPosts.id,
				set: {
					threadId: sql`excluded.thread_id`,
					postId: sql`excluded.post_id`,
					floor: sql`excluded.floor`,
					authorId: sql`excluded.author_id`,
					contentText: sql`excluded.content_text`,
					createTime: sql`excluded.create_time`,
					agreeNum: sql`excluded.agree_num`,
					raw: sql`excluded.raw`,
					sourceJobId: sql`excluded.source_job_id`,
					updatedAt: new Date(),
				},
			});
		return values.length;
	}
}
