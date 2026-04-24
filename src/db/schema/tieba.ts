import {
	boolean,
	char,
	date,
	index,
	integer,
	jsonb,
	pgTable,
	serial,
	smallint,
	text,
	timestamp,
	uniqueIndex,
	uuid,
	varchar,
} from "drizzle-orm/pg-core";

export const userPostTable = pgTable("userPost", {
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

export const postTable = pgTable("post", {
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

export const subPostTable = pgTable("subPost", {
	postId: varchar({ length: 12 }).notNull(),
	id: varchar({ length: 12 }).primaryKey().notNull(),
	time: timestamp().notNull(),
	content: text().notNull(),
	authorId: varchar({ length: 14 }).notNull(),
	otherId: varchar({ length: 14 }),
	otherName: varchar({ length: 16 }),
	pgRecordTime: date().defaultNow().notNull(),
});

export const forumKeyTable = pgTable("forumKey", {
	id: integer().primaryKey().notNull(),
	name: varchar({ length: 32 }).notNull(),
});

export const forumMemberTable = pgTable("forumMember", {
	forumId: integer().notNull(),
	portrait: varchar({ length: 36 }).notNull(),
	username: varchar({ length: 32 }),
	nickname: varchar({ length: 32 }).notNull(),
});

export const tiebaForums = pgTable(
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

export const tiebaUsers = pgTable("tieba_users", {
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

export const tiebaThreads = pgTable(
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

export const tiebaPosts = pgTable(
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

export const tiebaSubPosts = pgTable(
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

export const exportJobs = pgTable("export_jobs", {
	id: uuid("id").defaultRandom().primaryKey(),
	name: text("name").notNull(),
	status: varchar("status", { length: 24 }).default("pending").notNull(),
	config: jsonb("config").$type<Record<string, unknown>>().notNull(),
	errorMessage: text("error_message"),
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
});

export const exportTargets = pgTable(
	"export_targets",
	{
		id: serial("id").primaryKey(),
		jobId: uuid("job_id")
			.notNull()
			.references(() => exportJobs.id, { onDelete: "cascade" }),
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
	(table) => [index("export_targets_job_idx").on(table.jobId)],
);
