/**
 * Repository 是 export-mode 唯一接触数据库协调语义的边界。
 * 内容表只保存最终语料，所有写入都走 upsert，保证重复抓取不会污染结果。
 * export_* 表保存 job、target 和 thread task 的调度状态、断点和错误信息。
 * 多容器互斥依赖 PostgreSQL 唯一约束、事务和 `FOR UPDATE SKIP LOCKED`。
 * runner 只表达“要做什么”，lease、领取、续租、重试和统计都集中在这里。
 */
import {
	and,
	asc,
	count,
	desc,
	eq,
	gt,
	inArray,
	isNotNull,
	isNull,
	lt,
	lte,
	ne,
	or,
	sql,
	sum,
} from "drizzle-orm";
import type { TiebaDb } from "../db/index.ts";
import {
	exportForumPageTasks,
	exportJobHistory,
	exportJobNotifications,
	exportJobs,
	exportTargets,
	exportThreadTasks,
	tiebaForums,
	tiebaPosts,
	tiebaSubPosts,
	tiebaThreads,
	tiebaUsers,
} from "../db/schema/index.ts";
import type {
	ExportConfig,
	ExportNotifyConfig,
	ExportTargetConfig,
} from "./config.ts";

type ForumInsert = typeof tiebaForums.$inferInsert;
type UserInsert = typeof tiebaUsers.$inferInsert;
type ThreadInsert = typeof tiebaThreads.$inferInsert;
type PostInsert = typeof tiebaPosts.$inferInsert;
type SubPostInsert = typeof tiebaSubPosts.$inferInsert;
type DbExecutor = Pick<TiebaDb, "select" | "update">;
type DbWriter = Pick<TiebaDb, "insert" | "select" | "update">;

export interface ThreadTaskSeed {
	threadId: string;
	forumId: string;
	forumName: string;
	title: string;
	rawThread: Record<string, unknown>;
}

export interface ClaimedTargetScan {
	id: number;
	forumName: string;
	forumId: string | null;
	nextForumPage: number;
	pagesScanned: number;
	threadsFound: number;
}

export interface ClaimedForumPageTask {
	id: string;
	jobId: string;
	targetId: number;
	forumName: string;
	forumId: string | null;
	page: number;
	attempts: number;
}

export interface ClaimedThreadTask {
	id: string;
	jobId: string;
	targetId: number;
	threadId: string;
	forumId: string;
	forumName: string;
	title: string;
	nextPostPage: number;
	totalPostPages: number;
	attempts: number;
	rawThread: Record<string, unknown>;
}

export interface JobRunState {
	completed: boolean;
	failed: boolean;
	errorMessage?: string;
}

export interface ExportJobNotification {
	enabled: boolean;
	recipients: string[];
	progressIntervalMinutes: number;
	startedSentAt: Date | null;
	completedSentAt: Date | null;
	failedSentAt: Date | null;
	lastProgressSentAt: Date | null;
	lastEventSentAt: Date | null;
}

export interface ExportJobNotificationUpdate {
	enabled?: boolean;
	recipients?: string[];
	progressIntervalMinutes?: number;
}

export interface ExportJobTargetSummary {
	forumName: string;
	status: string;
	pagesScanned: number;
	threadsFound: number;
	threadsStored: number;
}

export interface ExportJobEstimate {
	remainingForums: number;
	remainingForumPageTasks: number;
	remainingThreadTasks: number;
	remainingTasks: number;
	elapsedSeconds: number;
	estimatedRemainingSeconds: number | null;
	estimatedCompletionAt: Date | null;
	basedOn: "history" | "progress" | "blended" | "insufficient_data";
	historySampleSize: number;
}

export interface ExportJobNotificationSnapshot {
	jobId: string;
	jobKey: string;
	jobName: string;
	status: string;
	summary: {
		forumsTotal: number;
		forumsDone: number;
		threadsFound: number;
		threadsStored: number;
		postsStored: number;
		subPostsStored: number;
	};
	notification: ExportJobNotification;
	estimate: ExportJobEstimate;
	errorMessage?: string;
	targets: ExportJobTargetSummary[];
}

function dedupeById<T extends { id: string }>(rows: T[]): T[] {
	const map = new Map<string, T>();
	for (const row of rows) map.set(row.id, row);
	return Array.from(map.values());
}

function dedupeTasks(rows: ThreadTaskSeed[]): ThreadTaskSeed[] {
	const map = new Map<string, ThreadTaskSeed>();
	for (const row of rows) map.set(row.threadId, row);
	return Array.from(map.values());
}

function errorMessage(err: unknown): string {
	return err instanceof Error ? err.message : String(err);
}

function dbLeaseExpiresAt(leaseSeconds: number) {
	return sql`now() + (${leaseSeconds} * interval '1 second')`;
}

function toNumber(value: number | string | null | undefined): number {
	const num = Number(value ?? 0);
	return Number.isFinite(num) ? num : 0;
}

function secondsBetween(start: Date, end: Date): number {
	return Math.max(0, Math.round((end.getTime() - start.getTime()) / 1000));
}

function average(values: number[]): number | null {
	if (values.length === 0) return null;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function notificationRecipients(value: unknown): string[] {
	if (!Array.isArray(value)) return [];

	const seen = new Set<string>();
	for (const item of value) {
		if (typeof item !== "string") continue;
		const email = item.trim();
		if (email) seen.add(email);
	}
	return Array.from(seen);
}

function publicJobConfig(config: ExportConfig): Record<string, unknown> {
	return {
		name: config.name,
		jobKey: config.jobKey,
		configHash: config.configHash,
		rate: config.rate,
		worker: config.worker,
		targets: config.targets.map((target) => ({
			targetKey: target.targetKey,
			forumName: target.forumName,
			startTime: target.startTime.toISOString(),
			endTime: target.endTime.toISOString(),
			sort: target.sort,
			pageSize: target.pageSize,
			maxForumPages: target.maxForumPages,
			maxThreadPages: target.maxThreadPages,
			maxThreads: target.maxThreads,
			includeComments: target.includeComments,
			activeSubPostFetch: target.activeSubPostFetch,
			activeSubPostPageLimit: target.activeSubPostPageLimit,
		})),
	};
}

export class ExportRepository {
	constructor(private readonly db: TiebaDb) {}

	private async ensureForumPageTasksWith(
		db: DbWriter,
		jobId: string,
		targetId: number,
		forumName: string,
		maxForumPages: number,
	): Promise<void> {
		for (let start = 1; start <= maxForumPages; start += 1000) {
			const batchSize = Math.min(1000, maxForumPages - start + 1);
			const batch = Array.from({ length: batchSize }, (_, i) => ({
				jobId,
				targetId,
				forumName,
				page: start + i,
				status: "pending",
			}));
			await db
				.insert(exportForumPageTasks)
				.values(batch)
				.onConflictDoNothing({
					target: [exportForumPageTasks.targetId, exportForumPageTasks.page],
				});
		}
	}

	private async resetForumPageTasksWith(
		db: DbWriter,
		jobId: string,
		targetId: number,
		forumName: string,
		maxForumPages: number,
	): Promise<void> {
		await db
			.update(exportForumPageTasks)
			.set({
				forumName,
				status: "pending",
				attempts: 0,
				threadsFound: 0,
				leaseOwner: null,
				leaseExpiresAt: null,
				heartbeatAt: null,
				lastError: null,
				completedAt: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(exportForumPageTasks.targetId, targetId),
					lte(exportForumPageTasks.page, maxForumPages),
				),
			);

		await db
			.update(exportForumPageTasks)
			.set({
				status: "cancelled",
				leaseOwner: null,
				leaseExpiresAt: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(exportForumPageTasks.targetId, targetId),
					gt(exportForumPageTasks.page, maxForumPages),
					ne(exportForumPageTasks.status, "completed"),
				),
			);

		await this.ensureForumPageTasksWith(
			db,
			jobId,
			targetId,
			forumName,
			maxForumPages,
		);
	}

	private async refreshTargetScanCompletionWith(
		db: DbExecutor,
		targetId: number,
	): Promise<void> {
		const [failedPageTask] = await db
			.select({ id: exportForumPageTasks.id })
			.from(exportForumPageTasks)
			.where(
				and(
					eq(exportForumPageTasks.targetId, targetId),
					eq(exportForumPageTasks.status, "failed"),
				),
			)
			.limit(1);
		if (failedPageTask) {
			await db
				.update(exportTargets)
				.set({
					status: "failed",
					scanStatus: "failed",
					finishedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(exportTargets.id, targetId));
			return;
		}

		const [activePageTask] = await db
			.select({ id: exportForumPageTasks.id })
			.from(exportForumPageTasks)
			.where(
				and(
					eq(exportForumPageTasks.targetId, targetId),
					inArray(exportForumPageTasks.status, ["pending", "running"]),
				),
			)
			.limit(1);
		if (activePageTask) return;

		await db
			.update(exportTargets)
			.set({
				scanStatus: "completed",
				scanLeaseOwner: null,
				scanLeaseExpiresAt: null,
				scanCompletedAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(exportTargets.id, targetId));
		await this.refreshTargetCompletionWith(db, targetId);
	}

	private async refreshTargetCompletionWith(
		db: DbExecutor,
		targetId: number,
	): Promise<void> {
		const [target] = await db
			.select({ scanStatus: exportTargets.scanStatus })
			.from(exportTargets)
			.where(eq(exportTargets.id, targetId))
			.limit(1);
		if (!target) return;

		const [failedTask] = await db
			.select({ id: exportThreadTasks.id })
			.from(exportThreadTasks)
			.where(
				and(
					eq(exportThreadTasks.targetId, targetId),
					eq(exportThreadTasks.status, "failed"),
				),
			)
			.limit(1);
		const [activeTask] = await db
			.select({ id: exportThreadTasks.id })
			.from(exportThreadTasks)
			.where(
				and(
					eq(exportThreadTasks.targetId, targetId),
					inArray(exportThreadTasks.status, ["pending", "running"]),
				),
			)
			.limit(1);
		const [failedPageTask] = await db
			.select({ id: exportForumPageTasks.id })
			.from(exportForumPageTasks)
			.where(
				and(
					eq(exportForumPageTasks.targetId, targetId),
					eq(exportForumPageTasks.status, "failed"),
				),
			)
			.limit(1);
		const [activePageTask] = await db
			.select({ id: exportForumPageTasks.id })
			.from(exportForumPageTasks)
			.where(
				and(
					eq(exportForumPageTasks.targetId, targetId),
					inArray(exportForumPageTasks.status, ["pending", "running"]),
				),
			)
			.limit(1);

		const nextStatus =
			failedTask || failedPageTask
				? "failed"
				: target.scanStatus === "completed" && !activeTask && !activePageTask
					? "completed"
					: "running";

		await db
			.update(exportTargets)
			.set({
				status: nextStatus,
				finishedAt: nextStatus === "running" ? null : new Date(),
				updatedAt: new Date(),
			})
			.where(eq(exportTargets.id, targetId));
	}

	private async refreshJobSummaryWith(
		db: DbExecutor,
		jobId: string,
	): Promise<void> {
		const [targetTotal] = await db
			.select({ value: count() })
			.from(exportTargets)
			.where(eq(exportTargets.jobId, jobId));
		const [targetDone] = await db
			.select({ value: count() })
			.from(exportTargets)
			.where(
				and(
					eq(exportTargets.jobId, jobId),
					eq(exportTargets.status, "completed"),
				),
			);
		const [taskTotal] = await db
			.select({ value: count() })
			.from(exportThreadTasks)
			.where(eq(exportThreadTasks.jobId, jobId));
		const [taskDone] = await db
			.select({ value: count() })
			.from(exportThreadTasks)
			.where(
				and(
					eq(exportThreadTasks.jobId, jobId),
					eq(exportThreadTasks.status, "completed"),
				),
			);
		const [taskSums] = await db
			.select({
				postsStored: sum(exportThreadTasks.postsStored),
				subPostsStored: sum(exportThreadTasks.subPostsStored),
			})
			.from(exportThreadTasks)
			.where(
				and(
					eq(exportThreadTasks.jobId, jobId),
					eq(exportThreadTasks.status, "completed"),
				),
			);

		await db
			.update(exportJobs)
			.set({
				forumsTotal: targetTotal?.value ?? 0,
				forumsDone: targetDone?.value ?? 0,
				threadsFound: taskTotal?.value ?? 0,
				threadsStored: taskDone?.value ?? 0,
				postsStored: toNumber(taskSums?.postsStored),
				subPostsStored: toNumber(taskSums?.subPostsStored),
				updatedAt: new Date(),
			})
			.where(eq(exportJobs.id, jobId));
	}

	private async getJobRunStateWith(
		db: Pick<TiebaDb, "select">,
		jobId: string,
	): Promise<JobRunState> {
		const [failedTarget] = await db
			.select({
				errorMessage: exportTargets.errorMessage,
			})
			.from(exportTargets)
			.where(
				and(eq(exportTargets.jobId, jobId), eq(exportTargets.status, "failed")),
			)
			.orderBy(desc(exportTargets.updatedAt))
			.limit(1);
		const [failedTask] = await db
			.select({
				lastError: exportThreadTasks.lastError,
			})
			.from(exportThreadTasks)
			.where(
				and(
					eq(exportThreadTasks.jobId, jobId),
					eq(exportThreadTasks.status, "failed"),
				),
			)
			.orderBy(desc(exportThreadTasks.updatedAt))
			.limit(1);
		const [openTarget] = await db
			.select({ id: exportTargets.id })
			.from(exportTargets)
			.where(
				and(
					eq(exportTargets.jobId, jobId),
					ne(exportTargets.scanStatus, "completed"),
				),
			)
			.limit(1);
		const [activeTask] = await db
			.select({ id: exportThreadTasks.id })
			.from(exportThreadTasks)
			.where(
				and(
					eq(exportThreadTasks.jobId, jobId),
					inArray(exportThreadTasks.status, ["pending", "running"]),
				),
			)
			.limit(1);
		const [latestTargetError] = await db
			.select({ errorMessage: exportTargets.errorMessage })
			.from(exportTargets)
			.where(
				and(
					eq(exportTargets.jobId, jobId),
					isNotNull(exportTargets.errorMessage),
				),
			)
			.orderBy(desc(exportTargets.updatedAt))
			.limit(1);

		const failed = !!failedTarget || !!failedTask;
		return {
			failed,
			completed: !failed && !openTarget && !activeTask,
			errorMessage:
				failedTarget?.errorMessage ??
				failedTask?.lastError ??
				latestTargetError?.errorMessage ??
				undefined,
		};
	}

	private async getJobNotificationWith(
		db: Pick<TiebaDb, "select">,
		jobId: string,
	): Promise<ExportJobNotification | null> {
		const [row] = await db
			.select({
				enabled: exportJobNotifications.enabled,
				recipients: exportJobNotifications.recipients,
				progressIntervalMinutes:
					exportJobNotifications.progressIntervalMinutes,
				startedSentAt: exportJobNotifications.startedSentAt,
				completedSentAt: exportJobNotifications.completedSentAt,
				failedSentAt: exportJobNotifications.failedSentAt,
				lastProgressSentAt: exportJobNotifications.lastProgressSentAt,
				lastEventSentAt: exportJobNotifications.lastEventSentAt,
			})
			.from(exportJobNotifications)
			.where(eq(exportJobNotifications.jobId, jobId))
			.limit(1);

		if (!row) return null;
		return {
			enabled: row.enabled,
			recipients: notificationRecipients(row.recipients),
			progressIntervalMinutes: row.progressIntervalMinutes,
			startedSentAt: row.startedSentAt,
			completedSentAt: row.completedSentAt,
			failedSentAt: row.failedSentAt,
			lastProgressSentAt: row.lastProgressSentAt,
			lastEventSentAt: row.lastEventSentAt,
		};
	}

	private async buildJobEstimate(
		job: {
			id: string;
			jobKey: string;
			forumsTotal: number;
			forumsDone: number;
			startedAt: Date;
		},
	): Promise<ExportJobEstimate> {
		const now = new Date();
		const elapsedSeconds = secondsBetween(job.startedAt, now);

		const [
			forumPageTotal,
			forumPageCompleted,
			forumPageCancelled,
			threadTaskTotal,
			threadTaskCompleted,
			historyRows,
		] = await Promise.all([
				this.db
					.select({ value: count() })
					.from(exportForumPageTasks)
					.where(eq(exportForumPageTasks.jobId, job.id)),
				this.db
					.select({ value: count() })
					.from(exportForumPageTasks)
					.where(
						and(
							eq(exportForumPageTasks.jobId, job.id),
							eq(exportForumPageTasks.status, "completed"),
						),
					),
				this.db
					.select({ value: count() })
					.from(exportForumPageTasks)
					.where(
						and(
							eq(exportForumPageTasks.jobId, job.id),
							eq(exportForumPageTasks.status, "cancelled"),
						),
					),
				this.db
					.select({ value: count() })
					.from(exportThreadTasks)
					.where(eq(exportThreadTasks.jobId, job.id)),
				this.db
					.select({ value: count() })
					.from(exportThreadTasks)
					.where(
						and(
							eq(exportThreadTasks.jobId, job.id),
							eq(exportThreadTasks.status, "completed"),
						),
					),
				this.db
					.select({ durationSeconds: exportJobHistory.durationSeconds })
					.from(exportJobHistory)
					.where(
						and(
							eq(exportJobHistory.jobKey, job.jobKey),
							eq(exportJobHistory.status, "completed"),
						),
					)
					.orderBy(desc(exportJobHistory.finishedAt))
					.limit(5),
			]);

		const forumPageTotalCount = toNumber(forumPageTotal[0]?.value);
		const forumPageCompletedCount = toNumber(forumPageCompleted[0]?.value);
		const forumPageCancelledCount = toNumber(forumPageCancelled[0]?.value);
		const threadTaskTotalCount = toNumber(threadTaskTotal[0]?.value);
		const threadTaskCompletedCount = toNumber(threadTaskCompleted[0]?.value);

		const effectiveForumPageTotal = Math.max(
			0,
			forumPageTotalCount - forumPageCancelledCount,
		);
		const remainingForumPageTasks = Math.max(
			0,
			effectiveForumPageTotal - forumPageCompletedCount,
		);
		const remainingThreadTasks = Math.max(
			0,
			threadTaskTotalCount - threadTaskCompletedCount,
		);
		const remainingForums = Math.max(0, job.forumsTotal - job.forumsDone);

		const ratios = [
			job.forumsTotal > 0 ? job.forumsDone / job.forumsTotal : null,
			effectiveForumPageTotal > 0
				? forumPageCompletedCount / effectiveForumPageTotal
				: null,
			threadTaskTotalCount > 0
				? threadTaskCompletedCount / threadTaskTotalCount
				: null,
		].filter((value): value is number => value !== null && value > 0);

		const historyDurations = historyRows
			.map((row) => row.durationSeconds)
			.filter((value) => Number.isFinite(value) && value > 0);
		const historyAverageSeconds = average(historyDurations);
		const progressRatio = average(ratios);
		const progressEstimatedTotalSeconds =
			progressRatio && progressRatio > 0
				? elapsedSeconds / progressRatio
				: null;

		let basedOn: ExportJobEstimate["basedOn"] = "insufficient_data";
		let estimatedTotalSeconds: number | null = null;

		if (
			historyAverageSeconds !== null &&
			progressEstimatedTotalSeconds !== null
		) {
			const historyWeight = Math.min(historyDurations.length, 3);
			estimatedTotalSeconds =
				(historyAverageSeconds * historyWeight + progressEstimatedTotalSeconds * 2) /
				(historyWeight + 2);
			basedOn = "blended";
		} else if (historyAverageSeconds !== null) {
			estimatedTotalSeconds = historyAverageSeconds;
			basedOn = "history";
		} else if (
			progressEstimatedTotalSeconds !== null &&
			progressRatio !== null &&
			progressRatio >= 0.05
		) {
			estimatedTotalSeconds = progressEstimatedTotalSeconds;
			basedOn = "progress";
		}

		const roundedEstimatedTotalSeconds =
			estimatedTotalSeconds === null
				? null
				: Math.max(elapsedSeconds, Math.round(estimatedTotalSeconds));
		const estimatedRemainingSeconds =
			roundedEstimatedTotalSeconds === null
				? null
				: Math.max(0, roundedEstimatedTotalSeconds - elapsedSeconds);
		const estimatedCompletionAt =
			estimatedRemainingSeconds === null
				? null
				: new Date(now.getTime() + estimatedRemainingSeconds * 1000);

		return {
			remainingForums,
			remainingForumPageTasks,
			remainingThreadTasks,
			remainingTasks: remainingForumPageTasks + remainingThreadTasks,
			elapsedSeconds,
			estimatedRemainingSeconds,
			estimatedCompletionAt,
			basedOn,
			historySampleSize: historyDurations.length,
		};
	}

	async ensureJob(config: ExportConfig, instanceId: string): Promise<string> {
		const [job] = await this.db
			.insert(exportJobs)
			.values({
				jobKey: config.jobKey,
				configHash: config.configHash,
				name: config.name,
				status: "running",
				config: publicJobConfig(config),
				leaseOwner: instanceId,
				heartbeatAt: new Date(),
				forumsTotal: config.targets.length,
			})
			.onConflictDoUpdate({
				target: exportJobs.jobKey,
				set: {
					configHash: config.configHash,
					name: config.name,
					status: "running",
					startedAt: sql`case
						when ${exportJobs.status} = 'running' then ${exportJobs.startedAt}
						else now()
					end`,
					config: publicJobConfig(config),
					errorMessage: null,
					leaseOwner: instanceId,
					heartbeatAt: new Date(),
					forumsTotal: config.targets.length,
					finishedAt: null,
					updatedAt: new Date(),
				},
			})
			.returning({ id: exportJobs.id });

		return job.id;
	}

	async updateJobHeartbeat(jobId: string, instanceId: string): Promise<void> {
		await this.db
			.update(exportJobs)
			.set({
				leaseOwner: instanceId,
				heartbeatAt: new Date(),
				updatedAt: new Date(),
			})
			.where(eq(exportJobs.id, jobId));
	}

	async ensureTarget(
		jobId: string,
		target: ExportTargetConfig,
	): Promise<number> {
		return this.db.transaction(async (tx) => {
			const [inserted] = await tx
				.insert(exportTargets)
				.values({
					jobId,
					targetKey: target.targetKey,
					forumName: target.forumName,
					startTime: target.startTime,
					endTime: target.endTime,
					status: "pending",
					scanStatus: "pending",
					nextForumPage: 1,
				})
				.onConflictDoNothing({
					target: [exportTargets.jobId, exportTargets.targetKey],
				})
				.returning({ id: exportTargets.id });
			if (inserted) {
				await this.ensureForumPageTasksWith(
					tx,
					jobId,
					inserted.id,
					target.forumName,
					target.maxForumPages,
				);
				return inserted.id;
			}

			const [existing] = await tx
				.select({
					id: exportTargets.id,
					endTime: exportTargets.endTime,
					scanStatus: exportTargets.scanStatus,
				})
				.from(exportTargets)
				.where(
					and(
						eq(exportTargets.jobId, jobId),
						eq(exportTargets.targetKey, target.targetKey),
					),
				)
				.limit(1)
				.for("update");
			if (!existing) {
				throw new Error(`Export target disappeared: ${target.targetKey}`);
			}

			const shouldRescan = target.endTime > existing.endTime;
			await tx
				.update(exportTargets)
				.set({
					forumName: target.forumName,
					startTime: target.startTime,
					endTime: shouldRescan ? target.endTime : existing.endTime,
					status: shouldRescan ? "pending" : undefined,
					scanStatus: shouldRescan ? "pending" : undefined,
					nextForumPage: shouldRescan ? 1 : undefined,
					scanLeaseOwner: shouldRescan ? null : undefined,
					scanLeaseExpiresAt: shouldRescan ? null : undefined,
					scanCompletedAt: shouldRescan ? null : undefined,
					scanAttempts: shouldRescan ? 0 : undefined,
					pagesScanned: shouldRescan ? 0 : undefined,
					threadsFound: shouldRescan ? 0 : undefined,
					finishedAt: shouldRescan ? null : undefined,
					updatedAt: new Date(),
				})
				.where(eq(exportTargets.id, existing.id));

			if (shouldRescan) {
				await this.resetForumPageTasksWith(
					tx,
					jobId,
					existing.id,
					target.forumName,
					target.maxForumPages,
				);
			} else if (existing.scanStatus !== "completed") {
				await this.ensureForumPageTasksWith(
					tx,
					jobId,
					existing.id,
					target.forumName,
					target.maxForumPages,
				);
			}

			return existing.id;
		});
	}

	async claimForumPageTask(
		jobId: string,
		instanceId: string,
		leaseSeconds: number,
		maxAttempts: number,
	): Promise<ClaimedForumPageTask | null> {
		return this.db.transaction(async (tx) => {
			const [candidate] = await tx
				.select({ id: exportForumPageTasks.id })
				.from(exportForumPageTasks)
				.innerJoin(
					exportTargets,
					eq(exportForumPageTasks.targetId, exportTargets.id),
				)
				.where(
					and(
						eq(exportForumPageTasks.jobId, jobId),
						ne(exportTargets.status, "failed"),
						ne(exportTargets.scanStatus, "completed"),
						lt(exportForumPageTasks.attempts, maxAttempts),
						or(
							eq(exportForumPageTasks.status, "pending"),
							and(
								eq(exportForumPageTasks.status, "running"),
								lt(exportForumPageTasks.leaseExpiresAt, sql`now()`),
							),
						),
					),
				)
				.orderBy(asc(exportForumPageTasks.page), asc(exportForumPageTasks.id))
				.limit(1)
				.for("update", { skipLocked: true });
			if (!candidate) return null;

			const [row] = await tx
				.update(exportForumPageTasks)
				.set({
					status: "running",
					leaseOwner: instanceId,
					leaseExpiresAt: dbLeaseExpiresAt(leaseSeconds),
					heartbeatAt: new Date(),
					attempts: sql`${exportForumPageTasks.attempts} + 1`,
					updatedAt: new Date(),
				})
				.where(eq(exportForumPageTasks.id, candidate.id))
				.returning({
					id: exportForumPageTasks.id,
					jobId: exportForumPageTasks.jobId,
					targetId: exportForumPageTasks.targetId,
					forumName: exportForumPageTasks.forumName,
					forumId: exportForumPageTasks.forumId,
					page: exportForumPageTasks.page,
					attempts: exportForumPageTasks.attempts,
				});
			if (row) {
				await tx
					.update(exportTargets)
					.set({
						status: "running",
						scanStatus: "running",
						finishedAt: null,
						updatedAt: new Date(),
					})
					.where(eq(exportTargets.id, row.targetId));
			}
			return row ?? null;
		});
	}

	async completeForumPageTask(
		id: string,
		instanceId: string,
		result: {
			forumId?: string;
			maxThreads?: number;
			stopAfterPage?: number;
			tasks: ThreadTaskSeed[];
		},
	): Promise<number> {
		return this.db.transaction(async (tx) => {
			const [pageTask] = await tx
				.select({
					jobId: exportForumPageTasks.jobId,
					targetId: exportForumPageTasks.targetId,
					forumName: exportForumPageTasks.forumName,
					page: exportForumPageTasks.page,
				})
				.from(exportForumPageTasks)
				.where(
					and(
						eq(exportForumPageTasks.id, id),
						eq(exportForumPageTasks.leaseOwner, instanceId),
						eq(exportForumPageTasks.status, "running"),
					),
				)
				.limit(1)
				.for("update");
			if (!pageTask) return 0;

			const [target] = await tx
				.select({ threadsFound: exportTargets.threadsFound })
				.from(exportTargets)
				.where(eq(exportTargets.id, pageTask.targetId))
				.limit(1)
				.for("update");
			const remaining = result.maxThreads
				? Math.max(0, result.maxThreads - (target?.threadsFound ?? 0))
				: Number.POSITIVE_INFINITY;
			const values = dedupeTasks(result.tasks)
				.slice(0, remaining)
				.map((task) => ({
					jobId: pageTask.jobId,
					targetId: pageTask.targetId,
					threadId: task.threadId,
					forumId: task.forumId,
					forumName: task.forumName,
					title: task.title,
					status: "pending",
					rawThread: task.rawThread,
				}));
			const inserted =
				values.length > 0
					? await tx
							.insert(exportThreadTasks)
							.values(values)
							.onConflictDoNothing({
								target: [exportThreadTasks.jobId, exportThreadTasks.threadId],
							})
							.returning({ id: exportThreadTasks.id })
					: [];
			const insertedCount = inserted.length;
			const reachedMaxThreads =
				!!result.maxThreads &&
				(target?.threadsFound ?? 0) + insertedCount >= result.maxThreads;

			await tx
				.update(exportForumPageTasks)
				.set({
					status: "completed",
					forumId: result.forumId ?? undefined,
					threadsFound: insertedCount,
					leaseOwner: null,
					leaseExpiresAt: null,
					heartbeatAt: new Date(),
					lastError: null,
					completedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(eq(exportForumPageTasks.id, id));

			await tx
				.update(exportTargets)
				.set({
					...(result.forumId ? { forumId: result.forumId } : {}),
					pagesScanned: sql`${exportTargets.pagesScanned} + 1`,
					threadsFound: sql`${exportTargets.threadsFound} + ${insertedCount}`,
					errorMessage: null,
					updatedAt: new Date(),
				})
				.where(eq(exportTargets.id, pageTask.targetId));

			if (result.stopAfterPage !== undefined) {
				await tx
					.update(exportForumPageTasks)
					.set({
						status: "cancelled",
						leaseOwner: null,
						leaseExpiresAt: null,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(exportForumPageTasks.targetId, pageTask.targetId),
							gt(exportForumPageTasks.page, result.stopAfterPage),
							eq(exportForumPageTasks.status, "pending"),
						),
					);
			}

			if (reachedMaxThreads) {
				await tx
					.update(exportForumPageTasks)
					.set({
						status: "cancelled",
						leaseOwner: null,
						leaseExpiresAt: null,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(exportForumPageTasks.targetId, pageTask.targetId),
							eq(exportForumPageTasks.status, "pending"),
						),
					);
			}

			await this.refreshTargetScanCompletionWith(tx, pageTask.targetId);
			return insertedCount;
		});
	}

	async releaseForumPageTask(
		id: string,
		instanceId: string,
		err?: unknown,
	): Promise<void> {
		await this.db
			.update(exportForumPageTasks)
			.set({
				status: "pending",
				leaseOwner: null,
				leaseExpiresAt: null,
				lastError: err ? errorMessage(err) : undefined,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(exportForumPageTasks.id, id),
					eq(exportForumPageTasks.leaseOwner, instanceId),
					eq(exportForumPageTasks.status, "running"),
				),
			);
	}

	async failForumPageTask(
		id: string,
		instanceId: string,
		maxAttempts: number,
		err: unknown,
	): Promise<void> {
		const message = errorMessage(err);
		await this.db.transaction(async (tx) => {
			const [task] = await tx
				.select({
					targetId: exportForumPageTasks.targetId,
					attempts: exportForumPageTasks.attempts,
				})
				.from(exportForumPageTasks)
				.where(
					and(
						eq(exportForumPageTasks.id, id),
						eq(exportForumPageTasks.leaseOwner, instanceId),
						eq(exportForumPageTasks.status, "running"),
					),
				)
				.limit(1)
				.for("update");
			if (!task) return;

			const nextStatus = task.attempts >= maxAttempts ? "failed" : "pending";
			await tx
				.update(exportForumPageTasks)
				.set({
					status: nextStatus,
					leaseOwner: null,
					leaseExpiresAt: null,
					lastError: message,
					updatedAt: new Date(),
				})
				.where(eq(exportForumPageTasks.id, id));

			if (nextStatus === "failed") {
				await tx
					.update(exportTargets)
					.set({
						status: "failed",
						scanStatus: "failed",
						errorMessage: message,
						finishedAt: new Date(),
						updatedAt: new Date(),
					})
					.where(eq(exportTargets.id, task.targetId));
				await tx
					.update(exportForumPageTasks)
					.set({
						status: "cancelled",
						leaseOwner: null,
						leaseExpiresAt: null,
						updatedAt: new Date(),
					})
					.where(
						and(
							eq(exportForumPageTasks.targetId, task.targetId),
							eq(exportForumPageTasks.status, "pending"),
						),
					);
			}
		});
	}

	// target producer lease：同一时间只有一个容器扫描某个吧的列表页。
	async claimTargetScan(
		jobId: string,
		instanceId: string,
		leaseSeconds: number,
		maxAttempts: number,
	): Promise<ClaimedTargetScan | null> {
		return this.db.transaction(async (tx) => {
			const [candidate] = await tx
				.select({ id: exportTargets.id })
				.from(exportTargets)
				.where(
					and(
						eq(exportTargets.jobId, jobId),
						ne(exportTargets.scanStatus, "completed"),
						ne(exportTargets.status, "failed"),
						lt(exportTargets.scanAttempts, maxAttempts),
						or(
							isNull(exportTargets.scanLeaseExpiresAt),
							lt(exportTargets.scanLeaseExpiresAt, sql`now()`),
						),
					),
				)
				.orderBy(asc(exportTargets.updatedAt), asc(exportTargets.id))
				.limit(1)
				.for("update", { skipLocked: true });
			if (!candidate) return null;

			const [row] = await tx
				.update(exportTargets)
				.set({
					scanStatus: "running",
					status: "running",
					scanLeaseOwner: instanceId,
					scanLeaseExpiresAt: dbLeaseExpiresAt(leaseSeconds),
					finishedAt: null,
					updatedAt: new Date(),
				})
				.where(eq(exportTargets.id, candidate.id))
				.returning({
					id: exportTargets.id,
					forumName: exportTargets.forumName,
					forumId: exportTargets.forumId,
					nextForumPage: exportTargets.nextForumPage,
					pagesScanned: exportTargets.pagesScanned,
					threadsFound: exportTargets.threadsFound,
				});
			return row ?? null;
		});
	}

	async updateTargetScanProgress(
		id: number,
		instanceId: string,
		progress: {
			nextForumPage: number;
			pagesScanned: number;
			threadsFoundDelta: number;
			leaseSeconds: number;
			forumId?: string;
		},
	): Promise<boolean> {
		const rows = await this.db
			.update(exportTargets)
			.set({
				...(progress.forumId ? { forumId: progress.forumId } : {}),
				nextForumPage: progress.nextForumPage,
				pagesScanned: progress.pagesScanned,
				threadsFound: sql`${exportTargets.threadsFound} + ${progress.threadsFoundDelta}`,
				scanLeaseExpiresAt: dbLeaseExpiresAt(progress.leaseSeconds),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(exportTargets.id, id),
					eq(exportTargets.scanLeaseOwner, instanceId),
				),
			)
			.returning({ id: exportTargets.id });
		return rows.length > 0;
	}

	async completeTargetScan(id: number, instanceId: string): Promise<boolean> {
		return this.db.transaction(async (tx) => {
			const rows = await tx
				.update(exportTargets)
				.set({
					scanStatus: "completed",
					scanLeaseOwner: null,
					scanLeaseExpiresAt: null,
					scanCompletedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(exportTargets.id, id),
						eq(exportTargets.scanLeaseOwner, instanceId),
					),
				)
				.returning({ id: exportTargets.id });
			if (rows.length === 0) return false;

			await this.refreshTargetCompletionWith(tx, id);
			return true;
		});
	}

	async releaseTargetScan(
		id: number,
		instanceId: string,
		err?: unknown,
	): Promise<void> {
		await this.db
			.update(exportTargets)
			.set({
				scanStatus: "pending",
				scanLeaseOwner: null,
				scanLeaseExpiresAt: null,
				errorMessage: err ? errorMessage(err) : undefined,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(exportTargets.id, id),
					eq(exportTargets.scanLeaseOwner, instanceId),
				),
			);
	}

	async failTargetScan(
		id: number,
		instanceId: string,
		maxAttempts: number,
		err: unknown,
	): Promise<void> {
		const message = errorMessage(err);
		await this.db.transaction(async (tx) => {
			const [target] = await tx
				.select({
					scanAttempts: exportTargets.scanAttempts,
				})
				.from(exportTargets)
				.where(
					and(
						eq(exportTargets.id, id),
						eq(exportTargets.scanLeaseOwner, instanceId),
					),
				)
				.limit(1)
				.for("update");
			if (!target) return;

			const nextAttempts = target.scanAttempts + 1;
			const terminal = nextAttempts >= maxAttempts;
			await tx
				.update(exportTargets)
				.set({
					status: terminal ? "failed" : "pending",
					scanStatus: terminal ? "failed" : "pending",
					scanAttempts: nextAttempts,
					scanLeaseOwner: null,
					scanLeaseExpiresAt: null,
					errorMessage: message,
					finishedAt: terminal ? new Date() : null,
					updatedAt: new Date(),
				})
				.where(eq(exportTargets.id, id));
		});
	}

	async enqueueThreadTasks(
		jobId: string,
		targetId: number,
		tasks: ThreadTaskSeed[],
	): Promise<number> {
		const values = dedupeTasks(tasks).map((task) => ({
			jobId,
			targetId,
			threadId: task.threadId,
			forumId: task.forumId,
			forumName: task.forumName,
			title: task.title,
			status: "pending",
			rawThread: task.rawThread,
		}));
		if (values.length === 0) return 0;

		const inserted = await this.db
			.insert(exportThreadTasks)
			.values(values)
			.onConflictDoNothing({
				target: [exportThreadTasks.jobId, exportThreadTasks.threadId],
			})
			.returning({ id: exportThreadTasks.id });
		return inserted.length;
	}

	// thread consumer lease：多个容器并发消费帖子任务，过期任务会被其他容器接管。
	async claimThreadTask(
		jobId: string,
		instanceId: string,
		leaseSeconds: number,
		maxAttempts: number,
	): Promise<ClaimedThreadTask | null> {
		return this.db.transaction(async (tx) => {
			const [candidate] = await tx
				.select({ id: exportThreadTasks.id })
				.from(exportThreadTasks)
				.where(
					and(
						eq(exportThreadTasks.jobId, jobId),
						lt(exportThreadTasks.attempts, maxAttempts),
						or(
							eq(exportThreadTasks.status, "pending"),
							and(
								eq(exportThreadTasks.status, "running"),
								lt(exportThreadTasks.leaseExpiresAt, sql`now()`),
							),
						),
					),
				)
				.orderBy(asc(exportThreadTasks.createdAt), asc(exportThreadTasks.id))
				.limit(1)
				.for("update", { skipLocked: true });
			if (!candidate) return null;

			const [row] = await tx
				.update(exportThreadTasks)
				.set({
					status: "running",
					leaseOwner: instanceId,
					leaseExpiresAt: dbLeaseExpiresAt(leaseSeconds),
					heartbeatAt: new Date(),
					attempts: sql`${exportThreadTasks.attempts} + 1`,
					updatedAt: new Date(),
				})
				.where(eq(exportThreadTasks.id, candidate.id))
				.returning({
					id: exportThreadTasks.id,
					jobId: exportThreadTasks.jobId,
					targetId: exportThreadTasks.targetId,
					threadId: exportThreadTasks.threadId,
					forumId: exportThreadTasks.forumId,
					forumName: exportThreadTasks.forumName,
					title: exportThreadTasks.title,
					nextPostPage: exportThreadTasks.nextPostPage,
					totalPostPages: exportThreadTasks.totalPostPages,
					attempts: exportThreadTasks.attempts,
					rawThread: exportThreadTasks.rawThread,
				});
			return row ?? null;
		});
	}

	async updateThreadTaskProgress(
		id: string,
		instanceId: string,
		progress: {
			nextPostPage: number;
			totalPostPages: number;
			postsStoredDelta: number;
			subPostsStoredDelta: number;
			leaseSeconds: number;
		},
	): Promise<boolean> {
		const rows = await this.db
			.update(exportThreadTasks)
			.set({
				nextPostPage: progress.nextPostPage,
				totalPostPages: progress.totalPostPages,
				postsStored: sql`${exportThreadTasks.postsStored} + ${progress.postsStoredDelta}`,
				subPostsStored: sql`${exportThreadTasks.subPostsStored} + ${progress.subPostsStoredDelta}`,
				leaseExpiresAt: dbLeaseExpiresAt(progress.leaseSeconds),
				heartbeatAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(exportThreadTasks.id, id),
					eq(exportThreadTasks.leaseOwner, instanceId),
					eq(exportThreadTasks.status, "running"),
				),
			)
			.returning({ id: exportThreadTasks.id });
		return rows.length > 0;
	}

	async extendThreadTaskLease(
		id: string,
		instanceId: string,
		leaseSeconds: number,
	): Promise<boolean> {
		const rows = await this.db
			.update(exportThreadTasks)
			.set({
				leaseExpiresAt: dbLeaseExpiresAt(leaseSeconds),
				heartbeatAt: new Date(),
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(exportThreadTasks.id, id),
					eq(exportThreadTasks.leaseOwner, instanceId),
					eq(exportThreadTasks.status, "running"),
				),
			)
			.returning({ id: exportThreadTasks.id });
		return rows.length > 0;
	}

	async completeThreadTask(id: string, instanceId: string): Promise<boolean> {
		return this.db.transaction(async (tx) => {
			const [row] = await tx
				.update(exportThreadTasks)
				.set({
					status: "completed",
					leaseOwner: null,
					leaseExpiresAt: null,
					heartbeatAt: new Date(),
					completedAt: new Date(),
					updatedAt: new Date(),
				})
				.where(
					and(
						eq(exportThreadTasks.id, id),
						eq(exportThreadTasks.leaseOwner, instanceId),
						eq(exportThreadTasks.status, "running"),
					),
				)
				.returning({
					jobId: exportThreadTasks.jobId,
					targetId: exportThreadTasks.targetId,
					postsStored: exportThreadTasks.postsStored,
					subPostsStored: exportThreadTasks.subPostsStored,
				});
			if (!row) return false;

			await tx
				.update(exportTargets)
				.set({
					threadsStored: sql`${exportTargets.threadsStored} + 1`,
					postsStored: sql`${exportTargets.postsStored} + ${row.postsStored}`,
					subPostsStored: sql`${exportTargets.subPostsStored} + ${row.subPostsStored}`,
					errorMessage: null,
					updatedAt: new Date(),
				})
				.where(eq(exportTargets.id, row.targetId));

			await tx
				.update(exportJobs)
				.set({
					threadsStored: sql`${exportJobs.threadsStored} + 1`,
					postsStored: sql`${exportJobs.postsStored} + ${row.postsStored}`,
					subPostsStored: sql`${exportJobs.subPostsStored} + ${row.subPostsStored}`,
					updatedAt: new Date(),
				})
				.where(eq(exportJobs.id, row.jobId));

			await this.refreshTargetCompletionWith(tx, row.targetId);
			return true;
		});
	}

	async failThreadTask(
		id: string,
		instanceId: string,
		maxAttempts: number,
		err: unknown,
	): Promise<void> {
		const message = errorMessage(err);
		await this.db.transaction(async (tx) => {
			const [task] = await tx
				.select({
					targetId: exportThreadTasks.targetId,
					attempts: exportThreadTasks.attempts,
				})
				.from(exportThreadTasks)
				.where(
					and(
						eq(exportThreadTasks.id, id),
						eq(exportThreadTasks.leaseOwner, instanceId),
						eq(exportThreadTasks.status, "running"),
					),
				)
				.limit(1)
				.for("update");
			if (!task) return null;

			const nextStatus = task.attempts >= maxAttempts ? "failed" : "pending";
			const [updated] = await tx
				.update(exportThreadTasks)
				.set({
					status: nextStatus,
					leaseOwner: null,
					leaseExpiresAt: null,
					lastError: message,
					updatedAt: new Date(),
				})
				.where(eq(exportThreadTasks.id, id))
				.returning({
					targetId: exportThreadTasks.targetId,
					status: exportThreadTasks.status,
				});
			if (!updated) return;

			if (updated.status === "failed") {
				await tx
					.update(exportTargets)
					.set({ errorMessage: message, updatedAt: new Date() })
					.where(eq(exportTargets.id, updated.targetId));
			}
			await this.refreshTargetCompletionWith(tx, updated.targetId);
		});
	}

	async releaseThreadTask(
		id: string,
		instanceId: string,
		err?: unknown,
	): Promise<void> {
		await this.db
			.update(exportThreadTasks)
			.set({
				status: "pending",
				leaseOwner: null,
				leaseExpiresAt: null,
				lastError: err ? errorMessage(err) : undefined,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(exportThreadTasks.id, id),
					eq(exportThreadTasks.leaseOwner, instanceId),
					eq(exportThreadTasks.status, "running"),
				),
			);
	}

	async refreshTargetCompletion(targetId: number): Promise<void> {
		await this.db.transaction((tx) =>
			this.refreshTargetCompletionWith(tx, targetId),
		);
	}

	async refreshJobSummary(jobId: string): Promise<void> {
		await this.db.transaction((tx) => this.refreshJobSummaryWith(tx, jobId));
	}

	async getJobRunState(jobId: string): Promise<JobRunState> {
		return this.db.transaction((tx) => this.getJobRunStateWith(tx, jobId));
	}

	async ensureJobNotification(
		jobId: string,
		notify: ExportNotifyConfig,
	): Promise<ExportJobNotification> {
		await this.db
			.insert(exportJobNotifications)
			.values({
				jobId,
				enabled: notify.enabled,
				recipients: notify.recipients,
				progressIntervalMinutes: notify.progressIntervalMinutes,
			})
			.onConflictDoNothing({
				target: exportJobNotifications.jobId,
			});

		const record = await this.getJobNotification(jobId);
		if (!record) {
			throw new Error(`Missing job notification config for job ${jobId}`);
		}
		return record;
	}

	async getJobNotification(jobId: string): Promise<ExportJobNotification | null> {
		return this.db.transaction((tx) => this.getJobNotificationWith(tx, jobId));
	}

	async updateJobNotification(
		jobId: string,
		update: ExportJobNotificationUpdate,
	): Promise<ExportJobNotification | null> {
		const [job] = await this.db
			.select({ id: exportJobs.id })
			.from(exportJobs)
			.where(eq(exportJobs.id, jobId))
			.limit(1);
		if (!job) return null;

		const current =
			(await this.getJobNotification(jobId)) ?? {
				enabled: false,
				recipients: [],
				progressIntervalMinutes: 30,
				startedSentAt: null,
				completedSentAt: null,
				failedSentAt: null,
				lastProgressSentAt: null,
				lastEventSentAt: null,
			};
		const recipients =
			update.recipients !== undefined
				? notificationRecipients(update.recipients)
				: current.recipients;
		const enabled =
			update.enabled !== undefined
				? update.enabled
				: recipients.length > 0
					? current.enabled
					: false;
		const progressIntervalMinutes =
			update.progressIntervalMinutes ?? current.progressIntervalMinutes;

		await this.db
			.insert(exportJobNotifications)
			.values({
				jobId,
				enabled,
				recipients,
				progressIntervalMinutes,
				startedSentAt: current.startedSentAt,
				completedSentAt: current.completedSentAt,
				failedSentAt: current.failedSentAt,
				lastProgressSentAt: current.lastProgressSentAt,
				lastEventSentAt: current.lastEventSentAt,
			})
			.onConflictDoUpdate({
				target: exportJobNotifications.jobId,
				set: {
					enabled,
					recipients,
					progressIntervalMinutes,
					updatedAt: new Date(),
				},
			});

		return this.getJobNotification(jobId);
	}

	async claimNotificationSend(
		jobId: string,
		eventType: "started" | "progress" | "completed" | "failed",
		instanceId: string,
		progressIntervalMinutes: number,
		leaseSeconds = 60,
	): Promise<boolean> {
		const now = new Date();
		const progressCutoff = new Date(
			now.getTime() - progressIntervalMinutes * 60_000,
		);

		const [claimed] = await this.db
			.update(exportJobNotifications)
			.set({
				sendLeaseOwner: instanceId,
				sendLeaseType: eventType,
				sendLeaseExpiresAt: dbLeaseExpiresAt(leaseSeconds),
				updatedAt: now,
			})
			.where(
				and(
					eq(exportJobNotifications.jobId, jobId),
					or(
						isNull(exportJobNotifications.sendLeaseExpiresAt),
						lt(exportJobNotifications.sendLeaseExpiresAt, now),
					),
					...(
						eventType === "started"
							? [isNull(exportJobNotifications.startedSentAt)]
							: eventType === "completed"
								? [isNull(exportJobNotifications.completedSentAt)]
								: eventType === "failed"
									? [isNull(exportJobNotifications.failedSentAt)]
									: [
											or(
												isNull(exportJobNotifications.lastProgressSentAt),
												lt(
													exportJobNotifications.lastProgressSentAt,
													progressCutoff,
												),
											),
										]
					),
				),
			)
			.returning({ jobId: exportJobNotifications.jobId });

		return !!claimed;
	}

	async releaseNotificationClaim(
		jobId: string,
		eventType: "started" | "progress" | "completed" | "failed",
		instanceId: string,
	): Promise<void> {
		await this.db
			.update(exportJobNotifications)
			.set({
				sendLeaseOwner: null,
				sendLeaseType: null,
				sendLeaseExpiresAt: null,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(exportJobNotifications.jobId, jobId),
					eq(exportJobNotifications.sendLeaseOwner, instanceId),
					eq(exportJobNotifications.sendLeaseType, eventType),
				),
			);
	}

	async markNotificationSent(
		jobId: string,
		eventType: "started" | "progress" | "completed" | "failed",
		instanceId: string,
		at: Date = new Date(),
	): Promise<void> {
		await this.db
			.update(exportJobNotifications)
			.set({
				...(eventType === "started" ? { startedSentAt: at } : {}),
				...(eventType === "completed" ? { completedSentAt: at } : {}),
				...(eventType === "failed" ? { failedSentAt: at } : {}),
				lastEventSentAt: at,
				...(eventType === "progress" ? { lastProgressSentAt: at } : {}),
				sendLeaseOwner: null,
				sendLeaseType: null,
				sendLeaseExpiresAt: null,
				updatedAt: at,
			})
			.where(
				and(
					eq(exportJobNotifications.jobId, jobId),
					eq(exportJobNotifications.sendLeaseOwner, instanceId),
					eq(exportJobNotifications.sendLeaseType, eventType),
				),
			);
	}

	async getJobNotificationSnapshot(
		jobId: string,
		includeTargets = false,
	): Promise<ExportJobNotificationSnapshot | null> {
		await this.refreshJobSummary(jobId);
		const [job] = await this.db
			.select({
				id: exportJobs.id,
				jobKey: exportJobs.jobKey,
				jobName: exportJobs.name,
				status: exportJobs.status,
				startedAt: exportJobs.startedAt,
				errorMessage: exportJobs.errorMessage,
				forumsTotal: exportJobs.forumsTotal,
				forumsDone: exportJobs.forumsDone,
				threadsFound: exportJobs.threadsFound,
				threadsStored: exportJobs.threadsStored,
				postsStored: exportJobs.postsStored,
				subPostsStored: exportJobs.subPostsStored,
			})
			.from(exportJobs)
			.where(eq(exportJobs.id, jobId))
			.limit(1);
		if (!job) return null;

		const notification =
			(await this.getJobNotification(jobId)) ?? {
				enabled: false,
				recipients: [],
				progressIntervalMinutes: 30,
				startedSentAt: null,
				completedSentAt: null,
				failedSentAt: null,
				lastProgressSentAt: null,
				lastEventSentAt: null,
			};
		const state = await this.getJobRunState(jobId);
		const estimate = await this.buildJobEstimate({
			id: job.id,
			jobKey: job.jobKey,
			forumsTotal: job.forumsTotal,
			forumsDone: job.forumsDone,
			startedAt: job.startedAt,
		});
		const targets = includeTargets
			? await this.db
					.select({
						forumName: exportTargets.forumName,
						status: exportTargets.status,
						pagesScanned: exportTargets.pagesScanned,
						threadsFound: exportTargets.threadsFound,
						threadsStored: exportTargets.threadsStored,
					})
					.from(exportTargets)
					.where(eq(exportTargets.jobId, jobId))
					.orderBy(asc(exportTargets.id))
			: [];

		return {
			jobId: job.id,
			jobKey: job.jobKey,
			jobName: job.jobName,
			status: job.status,
			summary: {
				forumsTotal: job.forumsTotal,
				forumsDone: job.forumsDone,
				threadsFound: job.threadsFound,
				threadsStored: job.threadsStored,
				postsStored: job.postsStored,
				subPostsStored: job.subPostsStored,
			},
			notification,
			estimate,
			errorMessage: job.errorMessage ?? state.errorMessage,
			targets,
		};
	}

	async finishJob(
		jobId: string,
		status: "completed" | "failed",
		err?: unknown,
	): Promise<void> {
		await this.db.transaction(async (tx) => {
			await this.refreshJobSummaryWith(tx, jobId);
			const finishedAt = new Date();
			const [job] = await tx
				.update(exportJobs)
				.set({
					status,
					errorMessage: err ? errorMessage(err) : null,
					finishedAt,
					updatedAt: finishedAt,
				})
				.where(eq(exportJobs.id, jobId))
				.returning({
					id: exportJobs.id,
					jobKey: exportJobs.jobKey,
					jobName: exportJobs.name,
					startedAt: exportJobs.startedAt,
					finishedAt: exportJobs.finishedAt,
					forumsTotal: exportJobs.forumsTotal,
					forumsDone: exportJobs.forumsDone,
					threadsFound: exportJobs.threadsFound,
					threadsStored: exportJobs.threadsStored,
					postsStored: exportJobs.postsStored,
					subPostsStored: exportJobs.subPostsStored,
				});
			if (!job?.finishedAt) return;

			await tx.insert(exportJobHistory).values({
				jobId: job.id,
				jobKey: job.jobKey,
				jobName: job.jobName,
				status,
				startedAt: job.startedAt,
				finishedAt: job.finishedAt,
				durationSeconds: secondsBetween(job.startedAt, job.finishedAt),
				forumsTotal: job.forumsTotal,
				forumsDone: job.forumsDone,
				threadsFound: job.threadsFound,
				threadsStored: job.threadsStored,
				postsStored: job.postsStored,
				subPostsStored: job.subPostsStored,
			});
		});
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
