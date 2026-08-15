import { describeRoute, validator as zValidator } from "hono-openapi";
import { Hono } from "hono";
import {
	and,
	asc,
	countDistinct,
	desc,
	eq,
	gte,
	ilike,
	inArray,
	isNotNull,
	notInArray,
	or,
	sql,
} from "drizzle-orm";
import { alias, union, unionAll } from "drizzle-orm/pg-core";
import { Cache, Duration, Effect } from "effect";
import { z } from "zod/v4";
import { getDb, type TiebaDb } from "../db/index.ts";
import {
	tiebaForums,
	tiebaPosts,
	tiebaSubPosts,
	tiebaThreads,
	tiebaUsers,
} from "../db/schema/tieba.ts";
import { userForumPairs } from "../db/schema/views.ts";

// ── 公共 user_forums UNION 查询构建器 ────────────────────────────────────────
// 合并 tieba_posts、tieba_threads、tieba_sub_posts→posts 的 (author_id, forum_id) 去重对

function buildUserForumsUnion(db: TiebaDb) {
	const sp = alias(tiebaSubPosts, "sp");
	const p = alias(tiebaPosts, "p");
	return union(
		db
			.select({ authorId: tiebaPosts.authorId, forumId: tiebaPosts.forumId })
			.from(tiebaPosts)
			.where(and(isNotNull(tiebaPosts.authorId), isNotNull(tiebaPosts.forumId))),
		db
			.select({ authorId: tiebaThreads.authorId, forumId: tiebaThreads.forumId })
			.from(tiebaThreads)
			.where(and(isNotNull(tiebaThreads.authorId), isNotNull(tiebaThreads.forumId))),
		db
			.select({ authorId: sp.authorId, forumId: p.forumId })
			.from(sp)
			.innerJoin(p, eq(sp.postId, p.id))
			.where(and(isNotNull(sp.authorId), isNotNull(p.forumId))),
	);
}

// ── Effect.Cache：跨吧用户所在的吧列表（模块级，TTL 1h）────────────────────

type CrossForum = { id: string; name: string | null; crossUserCount: number };

async function queryCrossForums(db: TiebaDb): Promise<CrossForum[]> {
	const ufCte = db.$with("user_forums").as(buildUserForumsUnion(db));

	// cross_forum_users: 在 ≥2 个吧发言过的用户
	const crossUsersCte = db.$with("cross_forum_users").as(
		db
			.select({ authorId: ufCte.authorId })
			.from(ufCte)
			.groupBy(ufCte.authorId)
			.having(gte(countDistinct(ufCte.forumId), 2)),
	);

	// cross_forum_activity: 每个吧中的跨吧用户数
	const crossActivityCte = db.$with("cross_forum_activity").as(
		db
			.select({
				forumId: ufCte.forumId,
				crossUserCount: sql<number>`COUNT(DISTINCT ${ufCte.authorId})::int`.as(
					"cross_user_count",
				),
			})
			.from(ufCte)
			.innerJoin(crossUsersCte, eq(ufCte.authorId, crossUsersCte.authorId))
			.groupBy(ufCte.forumId),
	);

	const rows = await db
		.with(ufCte, crossUsersCte, crossActivityCte)
		.select({
			id: crossActivityCte.forumId,
			name: tiebaForums.name,
			crossUserCount: crossActivityCte.crossUserCount,
		})
		.from(crossActivityCte)
		.leftJoin(tiebaForums, eq(tiebaForums.id, crossActivityCte.forumId as never))
		.orderBy(desc(crossActivityCte.crossUserCount));

	return rows.map((r) => ({
		id: r.id as string,
		name: r.name,
		crossUserCount: r.crossUserCount,
	}));
}

let _crossForumsCache: Cache.Cache<void, CrossForum[], never> | null = null;

async function getCrossForumsCached(): Promise<CrossForum[]> {
	const db = getDb();
	if (!_crossForumsCache) {
		_crossForumsCache = await Effect.runPromise(
			Cache.make({
				capacity: 1,
				timeToLive: Duration.hours(1),
				lookup: (_: void) => Effect.promise(() => queryCrossForums(db)),
			}),
		);
	}
	// biome-ignore lint/style/noNonNullAssertion: assigned in the block above
	return Effect.runPromise(_crossForumsCache!.get());
}

// ── Zod 参数 schema ───────────────────────────────────────────────────────────

const statsQuery = z.object({}).describe("数据库统计参数");

const topUsersQuery = z
	.object({
		minForums: z.string().optional().default("2").describe("最少发言吧数"),
		page: z.string().optional().default("1").describe("页码，从 1 开始"),
		limit: z.string().optional().default("50").describe("每页条数，最大 100"),
	})
	.describe("跨吧用户列表参数");

const intersectionQuery = z
	.object({
		forums: z
			.string()
			.describe("逗号分隔的吧 ID 列表，例如 id1,id2,id3，最多 20 个"),
		page: z.string().optional().default("1").describe("页码，从 1 开始"),
		limit: z.string().optional().default("50").describe("每页条数，最大 100"),
	})
	.describe("社区交集用户查询参数");

const userPostsQuery = z
	.object({
		authorId: z.string().describe("用户 ID"),
		forumId: z.string().optional().describe("按吧过滤（可选）"),
		page: z.string().optional().default("1").describe("页码，从 1 开始"),
		limit: z.string().optional().default("50").describe("每页条数，最大 100"),
	})
	.describe("用户发言查询参数");

const forumOverlapQuery = z
	.object({
		forums: z.string().describe("逗号分隔的已选吧 ID，最多 20 个"),
	})
	.describe("吧重叠用户数查询参数");

// ── 路由 ──────────────────────────────────────────────────────────────────────

export const dbAnalyzeRoute = new Hono()
	.use("*", async (c, next) => {
		if (!process.env.DATABASE_URL) {
			return c.json({ error: "Database not configured" }, 503);
		}
		await next();
	})
	// ── /stats ─────────────────────────────────────────────────────────────
	.get(
		"/stats",
		describeRoute({
			tags: ["analyze"],
			summary: "数据库跨吧用户统计",
			responses: { 200: { description: "统计数据" } },
		}),
		zValidator("query", statsQuery),
		async (c) => {
			const db = getDb();

			const ufCte = db.$with("user_forums").as(buildUserForumsUnion(db));
			const ufcCte = db.$with("user_forum_counts").as(
				db
					.select({
						authorId: ufCte.authorId,
						forumCount: sql<number>`COUNT(DISTINCT ${ufCte.forumId})::int`.as(
							"forum_count",
						),
					})
					.from(ufCte)
					.groupBy(ufCte.authorId),
			);

			const [distRows, totals] = await Promise.all([
				db
					.with(ufCte, ufcCte)
					.select({
						forumCount: ufcCte.forumCount,
						userCount: sql<number>`COUNT(*)::int`.as("user_count"),
					})
					.from(ufcCte)
					.groupBy(ufcCte.forumCount)
					.orderBy(asc(ufcCte.forumCount)),

				db
					.with(ufCte, ufcCte)
					.select({
						total: sql<number>`COUNT(*)::int`.as("total"),
						cross: sql<number>`COUNT(*) FILTER (WHERE ${ufcCte.forumCount} >= 2)::int`.as(
							"cross",
						),
					})
					.from(ufcCte),
			]);

			const distribution = distRows.map((r) => ({
				forumCount: r.forumCount,
				userCount: r.userCount,
			}));

			const { total, cross } = totals[0] ?? { total: 0, cross: 0 };

			return c.json({
				totalActiveUsers: total,
				crossForumUsers: cross,
				crossForumPercent:
					total > 0 ? ((cross / total) * 100).toFixed(1) : "0.0",
				distribution,
			});
		},
	)
	// ── /top-users ──────────────────────────────────────────────────────────
	.get(
		"/top-users",
		describeRoute({
			tags: ["analyze"],
			summary: "跨吧用户排行",
			responses: { 200: { description: "用户列表" } },
		}),
		zValidator("query", topUsersQuery),
		async (c) => {
			const { minForums, page, limit } = c.req.valid("query");
			const minF = Math.max(1, Number(minForums) || 2);
			const pageNum = Math.max(1, Number(page) || 1);
			const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
			const offset = (pageNum - 1) * limitNum;
			const db = getDb();

			const ufCte = db.$with("user_forums").as(buildUserForumsUnion(db));
			const ufcCte = db.$with("user_forum_counts").as(
				db
					.select({
						authorId: ufCte.authorId,
						forumCount: sql<number>`COUNT(DISTINCT ${ufCte.forumId})::int`.as(
							"forum_count",
						),
						forumIds: sql<
							string[]
						>`ARRAY_AGG(DISTINCT ${ufCte.forumId} ORDER BY ${ufCte.forumId})`.as(
							"forum_ids",
						),
					})
					.from(ufCte)
					.groupBy(ufCte.authorId),
			);

			const [usersRows, countRows] = await Promise.all([
				db
					.with(ufCte, ufcCte)
					.select({
						authorId: ufcCte.authorId,
						name: tiebaUsers.name,
						nameShow: tiebaUsers.nameShow,
						forumCount: ufcCte.forumCount,
						forumIds: ufcCte.forumIds,
					})
					.from(ufcCte)
					.leftJoin(tiebaUsers, eq(tiebaUsers.id, ufcCte.authorId as never))
					.where(gte(ufcCte.forumCount, minF))
					.orderBy(desc(ufcCte.forumCount), asc(ufcCte.authorId as never))
					.limit(limitNum)
					.offset(offset),

				db
					.with(ufCte, ufcCte)
					.select({ total: sql<number>`COUNT(*)::int`.as("total") })
					.from(ufcCte)
					.where(gte(ufcCte.forumCount, minF)),
			]);

			return c.json({
				total: countRows[0]?.total ?? 0,
				page: pageNum,
				limit: limitNum,
				users: usersRows.map((r) => ({
					authorId: r.authorId as string,
					name: r.name,
					nameShow: r.nameShow,
					forumCount: r.forumCount,
					forumIds: r.forumIds,
				})),
			});
		},
	)
	// ── /cross-forums ───────────────────────────────────────────────────────
	.get(
		"/cross-forums",
		describeRoute({
			tags: ["analyze"],
			summary: "跨吧用户所在的吧列表",
			description:
				"返回所有跨吧用户（发言 ≥2 个吧）所在的吧及其跨吧用户数，结果缓存 1 小时。",
			responses: { 200: { description: "吧列表" } },
		}),
		async (c) => {
			const forums = await getCrossForumsCached();
			return c.json({ forums });
		},
	)
	// ── /intersection ────────────────────────────────────────────────────────
	.get(
		"/intersection",
		describeRoute({
			tags: ["analyze"],
			summary: "社区交集用户",
			description:
				"查找同时在所有指定吧发过言的用户，附带各吧发帖数，按总发帖量降序。",
			responses: { 200: { description: "交集用户列表" } },
		}),
		zValidator("query", intersectionQuery),
		async (c) => {
			const { forums: forumsParam, page, limit } = c.req.valid("query");
			const forumIds = forumsParam
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
				.slice(0, 20);

			if (forumIds.length === 0) {
				return c.json({ total: 0, page: 1, limit: 50, users: [] });
			}

			const pageNum = Math.max(1, Number(page) || 1);
			const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
			const offset = (pageNum - 1) * limitNum;
			const db = getDb();

			const sp = alias(tiebaSubPosts, "sp");
			const p = alias(tiebaPosts, "p");

			// user_forums: 仅限选中吧
			const ufCte = db.$with("user_forums").as(
				union(
					db
						.select({ authorId: tiebaPosts.authorId, forumId: tiebaPosts.forumId })
						.from(tiebaPosts)
						.where(
							and(inArray(tiebaPosts.forumId, forumIds), isNotNull(tiebaPosts.authorId)),
						),
					db
						.select({ authorId: tiebaThreads.authorId, forumId: tiebaThreads.forumId })
						.from(tiebaThreads)
						.where(
							and(
								inArray(tiebaThreads.forumId, forumIds),
								isNotNull(tiebaThreads.authorId),
							),
						),
					db
						.select({ authorId: sp.authorId, forumId: p.forumId })
						.from(sp)
						.innerJoin(p, eq(sp.postId, p.id))
						.where(and(inArray(p.forumId, forumIds), isNotNull(sp.authorId))),
				),
			);

			// user_forum_posts: 每个 (author, forum) 的发言数
			const ufpCte = db.$with("user_forum_posts").as(
				db
					.select({
						authorId: ufCte.authorId,
						forumId: ufCte.forumId,
						postCount: sql<number>`COUNT(*)::int`.as("post_count"),
					})
					.from(ufCte)
					.groupBy(ufCte.authorId, ufCte.forumId),
			);

			// intersection_users: 在 ≥N 个吧（即所有选中吧）都发过言的用户
			const intersectionUsersCte = db.$with("intersection_users").as(
				db
					.select({
						authorId: ufpCte.authorId,
						totalPosts: sql<number>`SUM(${ufpCte.postCount})::int`.as("total_posts"),
					})
					.from(ufpCte)
					.groupBy(ufpCte.authorId)
					.having(gte(countDistinct(ufpCte.forumId), forumIds.length)),
			);

			const [usersRows, countRows] = await Promise.all([
				db
					.with(ufCte, ufpCte, intersectionUsersCte)
					.select({
						authorId: intersectionUsersCte.authorId,
						name: tiebaUsers.name,
						nameShow: tiebaUsers.nameShow,
						forumPosts:
							sql<Record<string, number>>`json_object_agg(${ufpCte.forumId}, ${ufpCte.postCount})`.as(
								"forum_posts",
							),
						totalPosts: intersectionUsersCte.totalPosts,
						// 从物化视图获取该用户所有曾发言的吧 ID（不限于选中吧）
						allForumIds: sql<
							string[]
						>`ARRAY(SELECT forum_id FROM eazy_tieba.user_forum_pairs WHERE author_id = ${intersectionUsersCte.authorId})`.as(
							"all_forum_ids",
						),
					})
					.from(intersectionUsersCte)
					.innerJoin(ufpCte, eq(ufpCte.authorId, intersectionUsersCte.authorId as never))
					.leftJoin(tiebaUsers, eq(tiebaUsers.id, intersectionUsersCte.authorId as never))
					.groupBy(
						intersectionUsersCte.authorId,
						tiebaUsers.name,
						tiebaUsers.nameShow,
						intersectionUsersCte.totalPosts,
					)
					.orderBy(desc(intersectionUsersCte.totalPosts))
					.limit(limitNum)
					.offset(offset),

				db
					.with(ufCte, ufpCte, intersectionUsersCte)
					.select({ total: sql<number>`COUNT(*)::int`.as("total") })
					.from(intersectionUsersCte),
			]);

			return c.json({
				total: countRows[0]?.total ?? 0,
				page: pageNum,
				limit: limitNum,
				users: usersRows.map((r) => ({
					authorId: r.authorId as string,
					name: r.name,
					nameShow: r.nameShow,
					totalPosts: r.totalPosts,
					forumPosts: r.forumPosts,
					allForumIds: r.allForumIds,
				})),
			});
		},
	)
	// ── /forum-overlap ───────────────────────────────────────────────────────────
	.get(
		"/forum-overlap",
		describeRoute({
			tags: ["analyze"],
			summary: "吧重叠用户数",
			description:
				"给定已选吧 ID 列表，返回其他每个吧中有多少用户同样在已选吧中发过言。",
			responses: { 200: { description: "各吧重叠用户数" } },
		}),
		zValidator("query", forumOverlapQuery),
		async (c) => {
			const { forums: forumsParam } = c.req.valid("query");
			const forumIds = forumsParam
				.split(",")
				.map((s) => s.trim())
				.filter(Boolean)
				.slice(0, 20);

			if (forumIds.length === 0) {
				return c.json({ overlaps: [] });
			}

			const db = getDb();

			// selected_users: 在已选吧中发过言的用户（使用物化视图）
			const selectedUsersCte = db.$with("selected_users").as(
				db
					.selectDistinct({ authorId: userForumPairs.authorId })
					.from(userForumPairs)
					.where(inArray(userForumPairs.forumId, forumIds)),
			);

			const overlapCount = sql<number>`COUNT(DISTINCT ${userForumPairs.authorId})::int`;

			const rows = await db
				.with(selectedUsersCte)
				.select({
					id: userForumPairs.forumId,
					name: tiebaForums.name,
					overlapCount,
				})
				.from(userForumPairs)
				.innerJoin(
					selectedUsersCte,
					eq(userForumPairs.authorId, selectedUsersCte.authorId),
				)
				.leftJoin(tiebaForums, eq(tiebaForums.id, userForumPairs.forumId))
				.where(notInArray(userForumPairs.forumId, forumIds))
				.groupBy(userForumPairs.forumId, tiebaForums.name)
				.orderBy(desc(overlapCount));

			return c.json({
				overlaps: rows.map((r) => ({
					id: r.id,
					name: r.name,
					overlapCount: r.overlapCount,
				})),
			});
		},
	)
	// ── /users (搜索) ────────────────────────────────────────────────────────
	.get(
		"/users",
		describeRoute({
			tags: ["analyze"],
			summary: "搜索用户",
			description: "按用户名或 ID 搜索，返回发言量最多的结果。",
			responses: { 200: { description: "用户列表" } },
		}),
		zValidator(
			"query",
			z.object({
				q: z.string().min(1).describe("用户名或 ID 关键词"),
				limit: z.string().optional().default("20").describe("返回条数，最大 50"),
			}),
		),
		async (c) => {
			const { q, limit } = c.req.valid("query");
			const limitNum = Math.min(50, Math.max(1, Number(limit) || 20));
			const db = getDb();
			const pattern = `%${q}%`;

			const postCount = sql<number>`
        COALESCE((SELECT COUNT(*)::int FROM eazy_tieba.tieba_posts WHERE author_id = ${tiebaUsers.id}), 0) +
        COALESCE((SELECT COUNT(*)::int FROM eazy_tieba.tieba_sub_posts WHERE author_id = ${tiebaUsers.id}), 0)
      `.as("post_count");

			const rows = await db
				.select({
					id: tiebaUsers.id,
					name: tiebaUsers.name,
					nameShow: tiebaUsers.nameShow,
					postCount,
				})
				.from(tiebaUsers)
				.where(
					or(
						eq(tiebaUsers.id, q),
						ilike(tiebaUsers.name, pattern),
						ilike(tiebaUsers.nameShow, pattern),
					),
				)
				.orderBy(desc(postCount))
				.limit(limitNum);

			return c.json({
				users: rows.map((r) => ({
					id: r.id,
					name: r.name,
					nameShow: r.nameShow,
					postCount: r.postCount,
				})),
			});
		},
	)
	// ── /user (删除) ─────────────────────────────────────────────────────────
	.delete(
		"/user",
		describeRoute({
			tags: ["analyze"],
			summary: "删除用户所有数据",
			description:
				"删除指定用户在 tieba_sub_posts、tieba_posts、tieba_threads、tieba_users 中的全部记录。",
			responses: { 200: { description: "删除结果" } },
		}),
		zValidator(
			"query",
			z.object({ authorId: z.string().min(1).describe("用户 ID") }),
		),
		async (c) => {
			const { authorId } = c.req.valid("query");
			const db = getDb();

			const [sp, p, t] = await Promise.all([
				db.delete(tiebaSubPosts).where(eq(tiebaSubPosts.authorId, authorId)),
				db.delete(tiebaPosts).where(eq(tiebaPosts.authorId, authorId)),
				db.delete(tiebaThreads).where(eq(tiebaThreads.authorId, authorId)),
			]);
			const u = await db.delete(tiebaUsers).where(eq(tiebaUsers.id, authorId));

			return c.json({
				deleted: {
					subPosts: sp.rowCount ?? 0,
					posts: p.rowCount ?? 0,
					threads: t.rowCount ?? 0,
					users: u.rowCount ?? 0,
				},
			});
		},
	)
	// ── /user-posts ──────────────────────────────────────────────────────────
	.get(
		"/user-posts",
		describeRoute({
			tags: ["analyze"],
			summary: "用户发言记录",
			description:
				"查询某用户在库内的所有发言（主帖回复 + 楼中楼），含吧名和帖子标题，按时间降序。",
			responses: { 200: { description: "发言列表" } },
		}),
		zValidator("query", userPostsQuery),
		async (c) => {
			const { authorId, forumId, page, limit } = c.req.valid("query");
			const pageNum = Math.max(1, Number(page) || 1);
			const limitNum = Math.min(100, Math.max(1, Number(limit) || 50));
			const offset = (pageNum - 1) * limitNum;
			const db = getDb();

			const f = alias(tiebaForums, "f");
			const t = alias(tiebaThreads, "t");
			const sp = alias(tiebaSubPosts, "sp");
			const pp = alias(tiebaPosts, "pp");
			const f2 = alias(tiebaForums, "f2");
			const t2 = alias(tiebaThreads, "t2");

			const postsQ = db
				.select({
					id: tiebaPosts.id,
					type: sql<"post" | "subpost">`'post'::text`,
					forumId: tiebaPosts.forumId,
					forumName: f.name,
					threadId: tiebaPosts.threadId,
					threadTitle: t.title,
					content: tiebaPosts.contentText,
					createTime: tiebaPosts.createTime,
					floor: tiebaPosts.floor,
					agreeNum: tiebaPosts.agreeNum,
				})
				.from(tiebaPosts)
				.leftJoin(f, eq(f.id, tiebaPosts.forumId))
				.leftJoin(t, eq(t.id, tiebaPosts.threadId))
				.where(
					and(
						eq(tiebaPosts.authorId, authorId),
						forumId ? eq(tiebaPosts.forumId, forumId) : undefined,
					),
				);

			const subpostsQ = db
				.select({
					id: sp.id,
					type: sql<"subpost">`'subpost'::text`,
					forumId: pp.forumId,
					forumName: f2.name,
					threadId: pp.threadId,
					threadTitle: t2.title,
					content: sp.contentText,
					createTime: sp.createTime,
					floor: sql<number>`0`,
					agreeNum: sp.agreeNum,
				})
				.from(sp)
				.innerJoin(pp, eq(sp.postId, pp.id))
				.leftJoin(f2, eq(f2.id, pp.forumId))
				.leftJoin(t2, eq(t2.id, pp.threadId))
				.where(
					and(
						eq(sp.authorId, authorId),
						forumId ? eq(pp.forumId, forumId) : undefined,
					),
				);

			const [postsRows, countsAndIp] = await Promise.all([
				unionAll(postsQ, subpostsQ)
					.orderBy(sql`create_time DESC NULLS LAST`)
					.limit(limitNum)
					.offset(offset),

				Promise.all([
					db
						.select({ count: sql<number>`COUNT(*)::int` })
						.from(tiebaPosts)
						.where(
							and(
								eq(tiebaPosts.authorId, authorId),
								forumId ? eq(tiebaPosts.forumId, forumId) : undefined,
							),
						)
						.then((r) => r[0]?.count ?? 0),

					db
						.select({ count: sql<number>`COUNT(*)::int` })
						.from(sp)
						.innerJoin(pp, eq(sp.postId, pp.id))
						.where(
							and(
								eq(sp.authorId, authorId),
								forumId ? eq(pp.forumId, forumId) : undefined,
							),
						)
						.then((r) => r[0]?.count ?? 0),

					db
						.select({ ipAddress: tiebaUsers.ipAddress })
						.from(tiebaUsers)
						.where(eq(tiebaUsers.id, authorId))
						.then((r) => r[0]?.ipAddress ?? null),
				]),
			]);

			const [postsCount, subpostsCount, userIpAddress] = countsAndIp;

			return c.json({
				total: postsCount + subpostsCount,
				page: pageNum,
				limit: limitNum,
				posts: postsRows.map((r) => ({
					id: r.id,
					type: r.type,
					forumId: r.forumId,
					forumName: r.forumName,
					threadId: r.threadId,
					threadTitle: r.threadTitle,
					content: r.content,
					createTime: r.createTime,
					floor: r.floor,
					agreeNum: r.agreeNum,
					ipAddress: userIpAddress,
				})),
			});
		},
	);
