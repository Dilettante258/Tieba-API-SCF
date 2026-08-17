import { Hono } from "hono";
import { describeRoute, validator as zValidator } from "hono-openapi";
import type { Pool, PoolClient } from "pg";
import { z } from "zod/v4";
import { getDbClient } from "../db/index.ts";
import {
	getAnalysisIndexStatus,
	refreshAnalysisIndex,
} from "../lib/db-analysis-index.ts";

type TypeSource = "official" | "custom";

interface CatalogType {
	id: string;
	name: string;
	source: TypeSource;
	level: "first" | "second" | "custom";
	parentId: string | null;
	forumIds: string[];
	updatedAt: string | null;
}

interface CatalogForum {
	id: string;
	name: string;
	firstClass: string;
	secondClass: string;
	crossUserCount: number;
	typeIds: string[];
}

function officialFirstId(name: string) {
	return `official:first:${encodeURIComponent(name)}`;
}

function officialSecondId(first: string, second: string) {
	return `official:second:${encodeURIComponent(first)}:${encodeURIComponent(second)}`;
}

async function loadCatalog(pool: Pool): Promise<{
	forums: CatalogForum[];
	types: CatalogType[];
}> {
	const [forumResult, groupResult] = await Promise.all([
		pool.query<{
			id: string;
			name: string;
			first_class: string;
			second_class: string;
			cross_user_count: number;
		}>(`WITH cross_users AS (
			SELECT author_id FROM eazy_tieba.user_forum_pairs
			GROUP BY author_id HAVING COUNT(DISTINCT forum_id) >= 2
		), forum_counts AS (
			SELECT u.forum_id, COUNT(DISTINCT u.author_id)::int AS cross_user_count
			FROM eazy_tieba.user_forum_pairs u
			JOIN cross_users c ON c.author_id = u.author_id
			GROUP BY u.forum_id
		)
		SELECT f.id, f.name,
			COALESCE(NULLIF(f.raw->>'firstClass', ''), '未分类') AS first_class,
			COALESCE(NULLIF(f.raw->>'secondClass', ''), '未分类') AS second_class,
			COALESCE(fc.cross_user_count, 0)::int AS cross_user_count
		FROM eazy_tieba.tieba_forums f
		LEFT JOIN forum_counts fc ON fc.forum_id = f.id
		ORDER BY fc.cross_user_count DESC NULLS LAST, f.name`),
		pool.query<{
			id: string;
			name: string;
			updated_at: Date;
			forum_ids: string[];
		}>(`SELECT g.id, g.name, g.updated_at,
			COALESCE(array_agg(m.forum_id ORDER BY f.name)
				FILTER (WHERE m.forum_id IS NOT NULL), ARRAY[]::text[]) AS forum_ids
		FROM eazy_tieba.forum_analysis_groups g
		LEFT JOIN eazy_tieba.forum_analysis_group_members m ON m.group_id = g.id
		LEFT JOIN eazy_tieba.tieba_forums f ON f.id = m.forum_id
		GROUP BY g.id ORDER BY g.name`),
	]);

	const typeMap = new Map<string, CatalogType>();
	const forumTypeIds = new Map<string, string[]>();
	for (const row of forumResult.rows) {
		const firstId = officialFirstId(row.first_class);
		const secondId = officialSecondId(row.first_class, row.second_class);
		const first = typeMap.get(firstId) ?? {
			id: firstId,
			name: row.first_class,
			source: "official" as const,
			level: "first" as const,
			parentId: null,
			forumIds: [],
			updatedAt: null,
		};
		first.forumIds.push(row.id);
		typeMap.set(firstId, first);
		const second = typeMap.get(secondId) ?? {
			id: secondId,
			name: row.second_class,
			source: "official" as const,
			level: "second" as const,
			parentId: firstId,
			forumIds: [],
			updatedAt: null,
		};
		second.forumIds.push(row.id);
		typeMap.set(secondId, second);
		forumTypeIds.set(row.id, [firstId, secondId]);
	}

	for (const row of groupResult.rows) {
		const id = `custom:${row.id}`;
		typeMap.set(id, {
			id,
			name: row.name,
			source: "custom",
			level: "custom",
			parentId: null,
			forumIds: row.forum_ids,
			updatedAt: row.updated_at.toISOString(),
		});
		for (const forumId of row.forum_ids) {
			forumTypeIds.set(forumId, [...(forumTypeIds.get(forumId) ?? []), id]);
		}
	}

	return {
		forums: forumResult.rows.map((row) => ({
			id: row.id,
			name: row.name,
			firstClass: row.first_class,
			secondClass: row.second_class,
			crossUserCount: row.cross_user_count,
			typeIds: forumTypeIds.get(row.id) ?? [],
		})),
		types: Array.from(typeMap.values()).sort((a, b) =>
			a.source === b.source
				? a.name.localeCompare(b.name, "zh-CN")
				: a.source === "custom"
					? -1
					: 1,
		),
	};
}

const groupBody = z.object({
	name: z.string().trim().min(1).max(40),
	forumIds: z
		.array(z.string().min(1))
		.min(1)
		.max(1000)
		.transform((v) => [...new Set(v)]),
	expectedUpdatedAt: z.string().datetime().optional(),
});

async function replaceGroupMembers(
	client: PoolClient,
	groupId: string,
	forumIds: string[],
) {
	const existing = await client.query<{ id: string }>(
		"SELECT id FROM eazy_tieba.tieba_forums WHERE id = ANY($1::text[])",
		[forumIds],
	);
	if (existing.rowCount !== forumIds.length) {
		throw new Error("包含不存在的贴吧");
	}
	await client.query(
		"DELETE FROM eazy_tieba.forum_analysis_group_members WHERE group_id = $1",
		[groupId],
	);
	await client.query(
		`INSERT INTO eazy_tieba.forum_analysis_group_members (group_id, forum_id)
		 SELECT $1::uuid, id FROM unnest($2::text[]) AS id`,
		[groupId, forumIds],
	);
}

const analysisBody = z.object({
	typeIds: z
		.array(z.string().min(1))
		.min(2)
		.max(50)
		.transform((v) => [...new Set(v)]),
	forumIds: z
		.array(z.string().min(1))
		.min(1)
		.max(1000)
		.transform((v) => [...new Set(v)]),
	keywords: z
		.array(z.string().trim().min(1).max(50))
		.max(10)
		.default([])
		.transform((v) => [...new Set(v)]),
	matchMode: z.enum(["any", "all"]).default("any"),
	page: z.number().int().min(1).default(1),
	limit: z.number().int().min(1).max(50).default(50),
});

const utteranceBody = analysisBody.extend({
	authorId: z.string().min(1),
});

async function resolveAnalysisPairs(
	pool: Pool,
	typeIds: string[],
	forumIds: string[],
) {
	const catalog = await loadCatalog(pool);
	const typeMap = new Map(catalog.types.map((type) => [type.id, type]));
	const scope = new Set(forumIds);
	const pairTypeIds: string[] = [];
	const pairForumIds: string[] = [];
	for (const typeId of typeIds) {
		const type = typeMap.get(typeId);
		if (!type) throw new Error(`未知吧类型：${typeId}`);
		for (const forumId of type.forumIds) {
			if (!scope.has(forumId)) continue;
			pairTypeIds.push(typeId);
			pairForumIds.push(forumId);
		}
	}
	if (new Set(pairTypeIds).size < 2) {
		throw new Error("当前吧范围必须覆盖至少两个所选类型");
	}
	return { pairTypeIds, pairForumIds };
}

const utterancesCte = `scope_utterances AS NOT MATERIALIZED (
	SELECT t.id, 'thread'::text AS kind, t.forum_id,
		COALESCE(fp.author_id, t.author_id) AS author_id, t.id AS thread_id,
		t.title AS thread_title, COALESCE(fp.content_text, t.first_post_text, '') AS content,
		concat_ws(E'\\n', t.title, COALESCE(fp.content_text, t.first_post_text, '')) AS search_text,
		COALESCE(fp.create_time, t.create_time) AS create_time, 1::int AS floor,
		COALESCE(fp.agree_num, 0)::int AS agree_num
	FROM eazy_tieba.tieba_threads t
	LEFT JOIN eazy_tieba.tieba_posts fp ON fp.id = t.first_post_id
	WHERE t.forum_id = ANY($1::text[]) AND COALESCE(fp.author_id, t.author_id) IS NOT NULL
	UNION ALL
	SELECT p.id, 'post'::text, p.forum_id, p.author_id, p.thread_id,
		t.title, COALESCE(p.content_text, ''), p.content_text,
		p.create_time, p.floor, p.agree_num
	FROM eazy_tieba.tieba_posts p
	LEFT JOIN eazy_tieba.tieba_threads t ON t.id = p.thread_id
	WHERE p.forum_id = ANY($1::text[]) AND p.author_id IS NOT NULL AND p.floor <> 1
	UNION ALL
	SELECT sp.id, 'subpost'::text, p.forum_id, sp.author_id, p.thread_id,
		t.title, COALESCE(sp.content_text, ''), sp.content_text,
		sp.create_time, sp.floor, sp.agree_num
	FROM eazy_tieba.tieba_sub_posts sp
	JOIN eazy_tieba.tieba_posts p ON p.id = sp.post_id
	LEFT JOIN eazy_tieba.tieba_threads t ON t.id = p.thread_id
	WHERE p.forum_id = ANY($1::text[]) AND sp.author_id IS NOT NULL
)`;

function keywordExpression(
	keywords: string[],
	mode: "any" | "all",
	startParameter: number,
) {
	if (keywords.length === 0) return "TRUE";
	return keywords
		.map(
			(_, index) =>
				`u.search_text ILIKE ('%' || $${startParameter + index} || '%')`,
		)
		.join(mode === "all" ? " AND " : " OR ");
}

function keywordPatterns(keywords: string[]) {
	return keywords;
}

function matchedUtterancesCte(
	keywords: string[],
	mode: "any" | "all",
	startParameter: number,
) {
	const joiner = mode === "all" ? " AND " : " OR ";
	const parameters = keywords.map((_, index) => `$${startParameter + index}`);
	const threadWhere = parameters
		.map(
			(parameter) =>
				`(t.title ILIKE ('%' || ${parameter} || '%')
				 OR t.first_post_text ILIKE ('%' || ${parameter} || '%')
				 OR fp.content_text ILIKE ('%' || ${parameter} || '%'))`,
		)
		.join(joiner);
	const postWhere = parameters
		.map((parameter) => `p.content_text ILIKE ('%' || ${parameter} || '%')`)
		.join(joiner);
	const subPostWhere = parameters
		.map((parameter) => `sp.content_text ILIKE ('%' || ${parameter} || '%')`)
		.join(joiner);
	return `matched_utterances AS NOT MATERIALIZED (
		SELECT COALESCE(fp.author_id, t.author_id) AS author_id,
			COALESCE(fp.create_time, t.create_time) AS create_time,
			LEFT(concat_ws(E'\\n', t.title,
				COALESCE(fp.content_text, t.first_post_text, '')), 240) AS preview
		FROM eazy_tieba.tieba_threads t
		LEFT JOIN eazy_tieba.tieba_posts fp ON fp.id = t.first_post_id
		WHERE t.forum_id = ANY($1::text[])
			AND COALESCE(fp.author_id, t.author_id) IS NOT NULL AND (${threadWhere})
		UNION ALL
		SELECT p.author_id, p.create_time,
			LEFT(COALESCE(p.content_text, ''), 240) FROM eazy_tieba.tieba_posts p
		WHERE p.forum_id = ANY($1::text[]) AND p.author_id IS NOT NULL
			AND p.floor <> 1 AND (${postWhere})
		UNION ALL
		SELECT sp.author_id, sp.create_time,
			LEFT(COALESCE(sp.content_text, ''), 240) FROM eazy_tieba.tieba_sub_posts sp
		JOIN eazy_tieba.tieba_posts p ON p.id = sp.post_id
		WHERE p.forum_id = ANY($1::text[]) AND sp.author_id IS NOT NULL
			AND (${subPostWhere})
	)`;
}

function mapUtterance(row: Record<string, unknown>) {
	return {
		id: row.id as string,
		kind: row.kind as "thread" | "post" | "subpost",
		forumId: row.forum_id as string,
		forumName: row.forum_name as string | null,
		threadId: row.thread_id as string,
		threadTitle: row.thread_title as string | null,
		content: row.content as string,
		createTime:
			row.create_time instanceof Date
				? row.create_time.toISOString()
				: (row.create_time as string | null),
		floor: Number(row.floor ?? 0),
		agreeNum: Number(row.agree_num ?? 0),
	};
}

export const dbAnalyzeV2Route = new Hono()
	.get(
		"/forum-catalog",
		describeRoute({ tags: ["analyze"], summary: "分析贴吧与类型目录" }),
		async (c) => c.json(await loadCatalog(getDbClient().pool)),
	)
	.post(
		"/forum-groups",
		describeRoute({ tags: ["analyze"], summary: "新建自定义吧类型" }),
		zValidator("json", groupBody.omit({ expectedUpdatedAt: true })),
		async (c) => {
			const body = c.req.valid("json");
			const client = await getDbClient().pool.connect();
			try {
				await client.query("BEGIN");
				const created = await client.query<{ id: string; updated_at: Date }>(
					`INSERT INTO eazy_tieba.forum_analysis_groups (name)
					 VALUES ($1) RETURNING id, updated_at`,
					[body.name],
				);
				const group = created.rows[0];
				if (!group) throw new Error("创建吧类型失败");
				await replaceGroupMembers(client, group.id, body.forumIds);
				await client.query("COMMIT");
				return c.json(
					{
						id: group.id,
						name: body.name,
						forumIds: body.forumIds,
						updatedAt: group.updated_at.toISOString(),
					},
					201,
				);
			} catch (error) {
				await client.query("ROLLBACK");
				if ((error as { code?: string }).code === "23505")
					return c.json({ error: "吧类型名称已存在" }, 409);
				return c.json(
					{ error: error instanceof Error ? error.message : String(error) },
					400,
				);
			} finally {
				client.release();
			}
		},
	)
	.put(
		"/forum-groups/:id",
		describeRoute({ tags: ["analyze"], summary: "更新自定义吧类型" }),
		zValidator("json", groupBody),
		async (c) => {
			const body = c.req.valid("json");
			const id = c.req.param("id");
			const client = await getDbClient().pool.connect();
			try {
				await client.query("BEGIN");
				const updated = await client.query<{ updated_at: Date }>(
					`UPDATE eazy_tieba.forum_analysis_groups SET name = $2, updated_at = now()
					 WHERE id = $1 AND ($3::timestamptz IS NULL OR updated_at = $3::timestamptz)
					 RETURNING updated_at`,
					[id, body.name, body.expectedUpdatedAt ?? null],
				);
				if (!updated.rows[0]) {
					const exists = await client.query(
						"SELECT 1 FROM eazy_tieba.forum_analysis_groups WHERE id = $1",
						[id],
					);
					await client.query("ROLLBACK");
					return c.json(
						{
							error: exists.rowCount
								? "吧类型已被其他操作修改，请刷新后重试"
								: "吧类型不存在",
						},
						exists.rowCount ? 409 : 404,
					);
				}
				await replaceGroupMembers(client, id, body.forumIds);
				await client.query("COMMIT");
				return c.json({
					id,
					name: body.name,
					forumIds: body.forumIds,
					updatedAt: updated.rows[0].updated_at.toISOString(),
				});
			} catch (error) {
				await client.query("ROLLBACK");
				if ((error as { code?: string }).code === "23505")
					return c.json({ error: "吧类型名称已存在" }, 409);
				return c.json(
					{ error: error instanceof Error ? error.message : String(error) },
					400,
				);
			} finally {
				client.release();
			}
		},
	)
	.delete(
		"/forum-groups/:id",
		describeRoute({ tags: ["analyze"], summary: "删除自定义吧类型" }),
		async (c) => {
			const result = await getDbClient().pool.query(
				"DELETE FROM eazy_tieba.forum_analysis_groups WHERE id = $1 RETURNING id",
				[c.req.param("id")],
			);
			return result.rowCount
				? c.json({ deleted: true })
				: c.json({ error: "吧类型不存在" }, 404);
		},
	)
	.get(
		"/analysis-index",
		describeRoute({ tags: ["analyze"], summary: "分析索引状态" }),
		async (c) => c.json(await getAnalysisIndexStatus(getDbClient().pool)),
	)
	.post(
		"/analysis-index/refresh",
		describeRoute({ tags: ["analyze"], summary: "刷新分析索引" }),
		async (c) => {
			const result = await refreshAnalysisIndex(getDbClient().pool);
			return result.refreshed
				? c.json(result)
				: c.json({ ...result, error: "已有刷新任务正在执行" }, 409);
		},
	)
	.post(
		"/cross-type-analysis",
		describeRoute({ tags: ["analyze"], summary: "跨类型用户与言论分析" }),
		zValidator("json", analysisBody),
		async (c) => {
			const body = c.req.valid("json");
			try {
				const pairs = await resolveAnalysisPairs(
					getDbClient().pool,
					body.typeIds,
					body.forumIds,
				);
				const commonCtes = `ignored_params AS (SELECT $4::text[], $5::text),
					input_type_forums AS (
						SELECT * FROM unnest($2::text[], $3::text[]) AS x(type_id, forum_id)
					), user_types AS (
						SELECT DISTINCT u.author_id, x.type_id
						FROM eazy_tieba.user_forum_pairs u
						JOIN input_type_forums x ON x.forum_id = u.forum_id
					), qualified_users AS (
						SELECT author_id, array_agg(type_id ORDER BY type_id) AS type_ids,
							COUNT(*)::int AS type_count
						FROM user_types GROUP BY author_id HAVING COUNT(*) >= 2
					), user_forums AS (
						SELECT u.author_id, array_agg(DISTINCT u.forum_id) AS forum_ids
						FROM eazy_tieba.user_forum_pairs u
						JOIN qualified_users q ON q.author_id = u.author_id
						WHERE u.forum_id = ANY($1::text[]) GROUP BY u.author_id
					)`;
				const matchedCte = matchedUtterancesCte(
					body.keywords,
					body.matchMode,
					8,
				);
				const keywordSql = `WITH ${commonCtes}, ${matchedCte}, matches AS (
						SELECT u.author_id, COUNT(*)::int AS match_count,
							MAX(u.create_time) AS latest_match_at,
							COALESCE((array_agg(u.preview ORDER BY u.create_time DESC NULLS LAST)
								FILTER (WHERE u.preview <> ''))[1:3], ARRAY[]::text[]) AS previews
						FROM matched_utterances u
						JOIN qualified_users q ON q.author_id = u.author_id
						GROUP BY u.author_id
					), ranked_page AS (
						SELECT q.author_id, usr.name, usr.name_show, q.type_ids, q.type_count,
							uf.forum_ids, cardinality(uf.forum_ids)::int AS forum_count,
							m.match_count, m.latest_match_at, m.previews,
							COUNT(*) OVER()::int AS total
						FROM matches m JOIN qualified_users q ON q.author_id = m.author_id
						JOIN user_forums uf ON uf.author_id = q.author_id
						LEFT JOIN eazy_tieba.tieba_users usr ON usr.id = q.author_id
						ORDER BY m.match_count DESC, m.latest_match_at DESC NULLS LAST, q.author_id
						LIMIT $6 OFFSET $7
					)
					SELECT r.* FROM ranked_page r
					ORDER BY r.match_count DESC, r.latest_match_at DESC NULLS LAST, r.author_id`;
				const overviewSql = `WITH ${commonCtes}, ranked_page AS (
						SELECT q.author_id, usr.name, usr.name_show, q.type_ids, q.type_count,
							uf.forum_ids, cardinality(uf.forum_ids)::int AS forum_count,
							0::int AS match_count, NULL::timestamptz AS latest_match_at,
							ARRAY[]::text[] AS previews,
							COUNT(*) OVER()::int AS total
						FROM qualified_users q JOIN user_forums uf ON uf.author_id = q.author_id
						LEFT JOIN eazy_tieba.tieba_users usr ON usr.id = q.author_id
						ORDER BY q.type_count DESC, cardinality(uf.forum_ids) DESC, q.author_id
						LIMIT $6 OFFSET $7
					)
					SELECT r.* FROM ranked_page r
					ORDER BY r.type_count DESC, r.forum_count DESC, r.author_id`;
				const result = await getDbClient().pool.query<Record<string, unknown>>(
					body.keywords.length > 0 ? keywordSql : overviewSql,
					[
						body.forumIds,
						pairs.pairTypeIds,
						pairs.pairForumIds,
						body.keywords,
						body.matchMode,
						body.limit,
						(body.page - 1) * body.limit,
						...keywordPatterns(body.keywords),
					],
				);
				const authorIds = result.rows.map((row) => row.author_id as string);
				const activityResult =
					authorIds.length === 0
						? {
								rows: [] as Array<{
									author_id: string;
									activity_count: number;
								}>,
							}
						: await getDbClient().pool.query<{
								author_id: string;
								activity_count: number;
							}>(
								`SELECT author_id, COUNT(*)::int AS activity_count FROM (
									SELECT t.author_id FROM eazy_tieba.tieba_threads t
									WHERE t.author_id = ANY($1::text[]) AND t.forum_id = ANY($2::text[])
									UNION ALL
									SELECT p.author_id FROM eazy_tieba.tieba_posts p
									WHERE p.author_id = ANY($1::text[]) AND p.forum_id = ANY($2::text[]) AND p.floor <> 1
									UNION ALL
									SELECT sp.author_id FROM eazy_tieba.tieba_sub_posts sp
									JOIN eazy_tieba.tieba_posts p ON p.id = sp.post_id
									WHERE sp.author_id = ANY($1::text[]) AND p.forum_id = ANY($2::text[])
								) activity_rows GROUP BY author_id`,
								[authorIds, body.forumIds],
							);
				const activityMap = new Map(
					activityResult.rows.map((row) => [row.author_id, row.activity_count]),
				);
				const total = Number(result.rows[0]?.total ?? 0);
				return c.json({
					total,
					page: body.page,
					limit: body.limit,
					users: result.rows.map((row) => ({
						authorId: row.author_id as string,
						name: row.name as string | null,
						nameShow: row.name_show as string | null,
						typeIds: row.type_ids as string[],
						typeCount: Number(row.type_count),
						forumIds: row.forum_ids as string[],
						forumCount: Number(row.forum_count),
						activityCount: Number(
							activityMap.get(row.author_id as string) ?? 0,
						),
						matchCount: Number(row.match_count),
						previews: (row.previews as string[] | null) ?? [],
						latestMatchAt:
							row.latest_match_at instanceof Date
								? row.latest_match_at.toISOString()
								: null,
					})),
				});
			} catch (error) {
				return c.json(
					{ error: error instanceof Error ? error.message : String(error) },
					400,
				);
			}
		},
	)
	.post(
		"/cross-type-analysis/utterances",
		describeRoute({ tags: ["analyze"], summary: "跨类型用户命中发言详情" }),
		zValidator("json", utteranceBody),
		async (c) => {
			const body = c.req.valid("json");
			try {
				await resolveAnalysisPairs(
					getDbClient().pool,
					body.typeIds,
					body.forumIds,
				);
				const matchWhere = keywordExpression(body.keywords, body.matchMode, 9);
				const result = await getDbClient().pool.query<Record<string, unknown>>(
					`WITH ignored_params AS (
						SELECT $2::text[], $3::text[], $4::text[], $5::text
					), ${utterancesCte}
					SELECT u.*, f.name AS forum_name, COUNT(*) OVER()::int AS total
					FROM scope_utterances u
					LEFT JOIN eazy_tieba.tieba_forums f ON f.id = u.forum_id
					WHERE u.author_id = $8 AND (${matchWhere})
					ORDER BY u.create_time DESC NULLS LAST, u.id
					LIMIT $6 OFFSET $7`,
					[
						body.forumIds,
						[],
						[],
						body.keywords,
						body.matchMode,
						body.limit,
						(body.page - 1) * body.limit,
						body.authorId,
						...keywordPatterns(body.keywords),
					],
				);
				return c.json({
					total: Number(result.rows[0]?.total ?? 0),
					page: body.page,
					limit: body.limit,
					posts: result.rows.map(mapUtterance),
				});
			} catch (error) {
				return c.json(
					{ error: error instanceof Error ? error.message : String(error) },
					400,
				);
			}
		},
	);
