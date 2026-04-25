import { sql } from "drizzle-orm";
import {
	boolean,
	char,
	date,
	index,
	integer,
	jsonb,
	serial,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";
import { appDbSchema } from "./shared.ts";

export const userPostTable = appDbSchema.table("userPost", {
	uid: char({ length: 10 }).notNull(),
	forumId: integer().notNull(),
	forumName: varchar({ length: 32 }).notNull(),
	title: varchar({ length: 48 }).notNull(),
	threadId: varchar({ length: 12 }).notNull(),
	postId: varchar({ length: 12 }).primaryKey().notNull(),
	createTime: timestamp({ mode: "string" }).notNull(),
	affiliated: boolean().notNull(),
	content: text().notNull(),
	replyTo: varchar({ length: 32 }),
	pgRecordTime: date().defaultNow().notNull(),
});

export const postTable = appDbSchema.table("post", {
	forumId: integer().notNull(),
	postId: varchar({ length: 12 }).notNull(),
	id: varchar({ length: 12 }).primaryKey().notNull(),
	floor: integer().notNull(),
	time: timestamp().notNull(),
	content: text(),
	subPostNumber: smallint(),
	authorId: varchar({ length: 14 }).notNull(),
	ipAddress: varchar({ length: 8 }),
	agreeNum: smallint(),
	disagreeNum: smallint(),
	pgRecordTime: date().defaultNow().notNull(),
});

export const subPostTable = appDbSchema.table("subPost", {
	postId: varchar({ length: 12 }).notNull(),
	id: varchar({ length: 12 }).primaryKey().notNull(),
	time: timestamp().notNull(),
	content: text().notNull(),
	authorId: varchar({ length: 14 }).notNull(),
	otherId: varchar({ length: 14 }),
	otherName: varchar({ length: 16 }),
	pgRecordTime: date().defaultNow().notNull(),
});

export const forumKeyTable = appDbSchema.table("forumKey", {
	id: integer().primaryKey().notNull(),
	name: varchar({ length: 32 }).notNull(),
});

export const forumMemberTable = appDbSchema.table("forumMember", {
	forumId: integer().notNull(),
	portrait: varchar({ length: 36 }).notNull(),
	username: varchar({ length: 32 }),
	nickname: varchar({ length: 32 }).notNull(),
});

/**
 * `tieba_*` 内容表保存最终爬取结果，主键来自贴吧自身 id，写入时必须幂等。
 * `export_*` 表保存导出任务的调度状态、进度 counters 与失败信息。
 * 后续生产者-消费者版本会在 export 表族里补充 thread task、lease owner、
 * lease 过期时间与断点页字段，让多个 Docker 容器通过同一个 PostgreSQL 协同。
 * schema 层只描述持久化形状；具体 claim/heartbeat/retry 状态机放在 Repository。
 */
export const tiebaForums = appDbSchema.table(
	"tieba_forums",
	{
		id: text("id").primaryKey(),
		name: text("name").notNull(),
		raw: jsonb("raw").$type<Record<string, unknown>>(),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [uniqueIndex("tieba_forums_name_idx").on(table.name)],
);

export const tiebaUsers = appDbSchema.table("tieba_users", {
	id: text("id").primaryKey(),
	name: text("name"),
	nameShow: text("name_show"),
	portrait: text("portrait"),
	tiebaUid: text("tieba_uid"),
	ipAddress: text("ip_address"),
	levelId: integer("level_id"),
	raw: jsonb("raw").$type<Record<string, unknown>>(),
	createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
		.defaultNow()
		.notNull(),
	updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
		.defaultNow()
		.notNull(),
});

export const tiebaThreads = appDbSchema.table(
	"tieba_threads",
	{
		id: text("id").primaryKey(),
		forumId: text("forum_id").notNull(),
		forumName: text("forum_name").notNull(),
		title: text("title").notNull(),
		authorId: text("author_id"),
		firstPostId: text("first_post_id"),
		replyNum: integer("reply_num").default(0).notNull(),
		viewNum: integer("view_num").default(0).notNull(),
		shareNum: integer("share_num").default(0).notNull(),
		isGood: boolean("is_good").default(false).notNull(),
		isTop: boolean("is_top").default(false).notNull(),
		createTime: timestamp("create_time", {
			mode: "date",
			withTimezone: true,
		}),
		lastReplyTime: timestamp("last_reply_time", {
			mode: "date",
			withTimezone: true,
		}),
		firstPostText: text("first_post_text"),
		raw: jsonb("raw").$type<Record<string, unknown>>(),
		sourceJobId: uuid("source_job_id"),
		firstSeenAt: timestamp("first_seen_at", {
			mode: "date",
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
		lastFetchedAt: timestamp("last_fetched_at", {
			mode: "date",
			withTimezone: true,
		})
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("tieba_threads_forum_time_idx").on(table.forumId, table.createTime),
		index("tieba_threads_author_idx").on(table.authorId),
	],
);

export const tiebaPosts = appDbSchema.table(
	"tieba_posts",
	{
		id: text("id").primaryKey(),
		threadId: text("thread_id").notNull(),
		forumId: text("forum_id").notNull(),
		floor: integer("floor").default(0).notNull(),
		authorId: text("author_id"),
		contentText: text("content_text"),
		createTime: timestamp("create_time", {
			mode: "date",
			withTimezone: true,
		}),
		subPostNumber: integer("sub_post_number").default(0).notNull(),
		agreeNum: integer("agree_num").default(0).notNull(),
		disagreeNum: integer("disagree_num").default(0).notNull(),
		raw: jsonb("raw").$type<Record<string, unknown>>(),
		sourceJobId: uuid("source_job_id"),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("tieba_posts_thread_floor_idx").on(table.threadId, table.floor),
		index("tieba_posts_author_idx").on(table.authorId),
	],
);

export const tiebaSubPosts = appDbSchema.table(
	"tieba_sub_posts",
	{
		id: text("id").primaryKey(),
		threadId: text("thread_id").notNull(),
		postId: text("post_id").notNull(),
		floor: integer("floor").default(0).notNull(),
		authorId: text("author_id"),
		contentText: text("content_text"),
		createTime: timestamp("create_time", {
			mode: "date",
			withTimezone: true,
		}),
		agreeNum: integer("agree_num").default(0).notNull(),
		raw: jsonb("raw").$type<Record<string, unknown>>(),
		sourceJobId: uuid("source_job_id"),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("tieba_sub_posts_post_floor_idx").on(table.postId, table.floor),
		index("tieba_sub_posts_author_idx").on(table.authorId),
	],
);

export const exportJobs = appDbSchema.table(
	"export_jobs",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobKey: text("job_key").notNull(),
		configHash: text("config_hash").notNull(),
		name: text("name").notNull(),
		status: varchar("status", { length: 24 }).default("pending").notNull(),
		config: jsonb("config").$type<Record<string, unknown>>().notNull(),
		errorMessage: text("error_message"),
		leaseOwner: text("lease_owner"),
		heartbeatAt: timestamp("heartbeat_at", {
			mode: "date",
			withTimezone: true,
		}),
		forumsTotal: integer("forums_total").default(0).notNull(),
		forumsDone: integer("forums_done").default(0).notNull(),
		threadsFound: integer("threads_found").default(0).notNull(),
		threadsStored: integer("threads_stored").default(0).notNull(),
		postsStored: integer("posts_stored").default(0).notNull(),
		subPostsStored: integer("sub_posts_stored").default(0).notNull(),
		startedAt: timestamp("started_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true }),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [uniqueIndex("export_jobs_job_key_idx").on(table.jobKey)],
);

export const exportJobHistory = appDbSchema.table(
	"export_job_history",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobId: uuid("job_id")
			.notNull()
			.references(() => exportJobs.id, { onDelete: "cascade" }),
		jobKey: text("job_key").notNull(),
		jobName: text("job_name").notNull(),
		status: varchar("status", { length: 24 }).notNull(),
		startedAt: timestamp("started_at", { mode: "date", withTimezone: true })
			.notNull(),
		finishedAt: timestamp("finished_at", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
		durationSeconds: integer("duration_seconds").notNull(),
		forumsTotal: integer("forums_total").default(0).notNull(),
		forumsDone: integer("forums_done").default(0).notNull(),
		threadsFound: integer("threads_found").default(0).notNull(),
		threadsStored: integer("threads_stored").default(0).notNull(),
		postsStored: integer("posts_stored").default(0).notNull(),
		subPostsStored: integer("sub_posts_stored").default(0).notNull(),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("export_job_history_job_key_finished_idx").on(
			table.jobKey,
			table.finishedAt,
		),
		index("export_job_history_job_id_idx").on(table.jobId),
	],
);

export const exportJobNotifications = appDbSchema.table(
	"export_job_notifications",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobId: uuid("job_id")
			.notNull()
			.references(() => exportJobs.id, { onDelete: "cascade" }),
		enabled: boolean("enabled").default(false).notNull(),
		recipients: jsonb("recipients")
			.$type<string[]>()
			.default(sql`'[]'::jsonb`)
			.notNull(),
		progressIntervalMinutes: integer("progress_interval_minutes")
			.default(30)
			.notNull(),
		startedSentAt: timestamp("started_sent_at", {
			mode: "date",
			withTimezone: true,
		}),
		completedSentAt: timestamp("completed_sent_at", {
			mode: "date",
			withTimezone: true,
		}),
		failedSentAt: timestamp("failed_sent_at", {
			mode: "date",
			withTimezone: true,
		}),
		lastProgressSentAt: timestamp("last_progress_sent_at", {
			mode: "date",
			withTimezone: true,
		}),
		sendLeaseOwner: text("send_lease_owner"),
		sendLeaseType: varchar("send_lease_type", { length: 24 }),
		sendLeaseExpiresAt: timestamp("send_lease_expires_at", {
			mode: "date",
			withTimezone: true,
		}),
		lastEventSentAt: timestamp("last_event_sent_at", {
			mode: "date",
			withTimezone: true,
		}),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [uniqueIndex("export_job_notifications_job_idx").on(table.jobId)],
);

export const exportTargets = appDbSchema.table(
	"export_targets",
	{
		id: serial("id").primaryKey(),
		jobId: uuid("job_id")
			.notNull()
			.references(() => exportJobs.id, { onDelete: "cascade" }),
		targetKey: text("target_key").notNull(),
		forumName: text("forum_name").notNull(),
		forumId: text("forum_id"),
		startTime: timestamp("start_time", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
		endTime: timestamp("end_time", {
			mode: "date",
			withTimezone: true,
		}).notNull(),
		status: varchar("status", { length: 24 }).default("pending").notNull(),
		scanStatus: varchar("scan_status", { length: 24 })
			.default("pending")
			.notNull(),
		scanAttempts: integer("scan_attempts").default(0).notNull(),
		nextForumPage: integer("next_forum_page").default(1).notNull(),
		scanLeaseOwner: text("scan_lease_owner"),
		scanLeaseExpiresAt: timestamp("scan_lease_expires_at", {
			mode: "date",
			withTimezone: true,
		}),
		scanCompletedAt: timestamp("scan_completed_at", {
			mode: "date",
			withTimezone: true,
		}),
		pagesScanned: integer("pages_scanned").default(0).notNull(),
		threadsFound: integer("threads_found").default(0).notNull(),
		threadsStored: integer("threads_stored").default(0).notNull(),
		postsStored: integer("posts_stored").default(0).notNull(),
		subPostsStored: integer("sub_posts_stored").default(0).notNull(),
		errorMessage: text("error_message"),
		startedAt: timestamp("started_at", {
			mode: "date",
			withTimezone: true,
		}).defaultNow(),
		finishedAt: timestamp("finished_at", { mode: "date", withTimezone: true }),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
	},
	(table) => [
		index("export_targets_job_idx").on(table.jobId),
		index("export_targets_scan_idx").on(table.jobId, table.scanStatus),
		uniqueIndex("export_targets_job_target_key_idx").on(
			table.jobId,
			table.targetKey,
		),
	],
);

export const exportForumPageTasks = appDbSchema.table(
	"export_forum_page_tasks",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobId: uuid("job_id")
			.notNull()
			.references(() => exportJobs.id, { onDelete: "cascade" }),
		targetId: integer("target_id")
			.notNull()
			.references(() => exportTargets.id, { onDelete: "cascade" }),
		forumName: text("forum_name").notNull(),
		forumId: text("forum_id"),
		page: integer("page").notNull(),
		status: varchar("status", { length: 24 }).default("pending").notNull(),
		attempts: integer("attempts").default(0).notNull(),
		threadsFound: integer("threads_found").default(0).notNull(),
		leaseOwner: text("lease_owner"),
		leaseExpiresAt: timestamp("lease_expires_at", {
			mode: "date",
			withTimezone: true,
		}),
		heartbeatAt: timestamp("heartbeat_at", {
			mode: "date",
			withTimezone: true,
		}),
		lastError: text("last_error"),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		completedAt: timestamp("completed_at", {
			mode: "date",
			withTimezone: true,
		}),
	},
	(table) => [
		index("export_forum_page_tasks_target_status_idx").on(
			table.targetId,
			table.status,
		),
		index("export_forum_page_tasks_job_status_idx").on(
			table.jobId,
			table.status,
		),
		uniqueIndex("export_forum_page_tasks_target_page_idx").on(
			table.targetId,
			table.page,
		),
	],
);

export const exportThreadTasks = appDbSchema.table(
	"export_thread_tasks",
	{
		id: uuid("id").defaultRandom().primaryKey(),
		jobId: uuid("job_id")
			.notNull()
			.references(() => exportJobs.id, { onDelete: "cascade" }),
		targetId: integer("target_id")
			.notNull()
			.references(() => exportTargets.id, { onDelete: "cascade" }),
		threadId: text("thread_id").notNull(),
		forumId: text("forum_id").notNull(),
		forumName: text("forum_name").notNull(),
		title: text("title").notNull(),
		status: varchar("status", { length: 24 }).default("pending").notNull(),
		nextPostPage: integer("next_post_page").default(1).notNull(),
		totalPostPages: integer("total_post_pages").default(0).notNull(),
		attempts: integer("attempts").default(0).notNull(),
		postsStored: integer("posts_stored").default(0).notNull(),
		subPostsStored: integer("sub_posts_stored").default(0).notNull(),
		leaseOwner: text("lease_owner"),
		leaseExpiresAt: timestamp("lease_expires_at", {
			mode: "date",
			withTimezone: true,
		}),
		heartbeatAt: timestamp("heartbeat_at", {
			mode: "date",
			withTimezone: true,
		}),
		lastError: text("last_error"),
		rawThread: jsonb("raw_thread").$type<Record<string, unknown>>().notNull(),
		createdAt: timestamp("created_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		updatedAt: timestamp("updated_at", { mode: "date", withTimezone: true })
			.defaultNow()
			.notNull(),
		completedAt: timestamp("completed_at", {
			mode: "date",
			withTimezone: true,
		}),
	},
	(table) => [
		index("export_thread_tasks_target_status_idx").on(
			table.targetId,
			table.status,
		),
		index("export_thread_tasks_job_status_idx").on(table.jobId, table.status),
		uniqueIndex("export_thread_tasks_job_thread_idx").on(
			table.jobId,
			table.threadId,
		),
	],
);
