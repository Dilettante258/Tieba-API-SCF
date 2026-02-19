import { zValidator } from "@hono/zod-validator";
import { getPosts } from "@tieba/sdk";
import { Effect, Either, pipe } from "effect";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { fetchForumThreadsEnough } from "../lib/forum-threads.ts";

// ── 请求参数 ──────────────────────────────────────────────

const searchQuery = z.object({
	fname: z.string(),
	// 用户条件：type:value 格式，逗号分隔。如 "uid:123,un:用户名,id:456"
	users: z.string().optional().default(""),
	// 关键词条件：逗号分隔
	keywords: z.string().optional().default(""),
	sort: z.string().optional().default("1"),
	count: z.string().optional().default("100"),
	depth: z.enum(["first", "all"]).optional().default("first"),
});

// ── 用户条件解析 ──────────────────────────────────────────

interface UserCondition {
	type: "uid" | "un" | "id";
	value: string;
}

function parseUserConditions(raw: string): UserCondition[] {
	if (!raw.trim()) return [];
	return raw
		.split(",")
		.map((s) => {
			const idx = s.indexOf(":");
			if (idx === -1) return null;
			const type = s.slice(0, idx).trim();
			const value = s.slice(idx + 1).trim();
			if (!value || !["uid", "un", "id"].includes(type)) return null;
			return { type: type as UserCondition["type"], value };
		})
		.filter((c): c is UserCondition => c !== null);
}

// ── 文本提取 ──────────────────────────────────────────────

/** PbContent 中的文本类型 */
const TEXT_CONTENT_TYPES = new Set([0, 1, 4, 9, 18, 27, 40]);

// 从 SDK 推断类型
type PostsResult = Effect.Effect.Success<ReturnType<typeof getPosts>>;
type Post = NonNullable<PostsResult>["postList"][number];
type User = NonNullable<PostsResult>["userList"][number];

/** 从 PbContent[] 提取纯文本 */
function extractText(content: Post["content"]): string {
	if (!content) return "";
	const parts: string[] = [];
	for (const c of content) {
		if (TEXT_CONTENT_TYPES.has(c.type) && c.text) {
			parts.push(c.text);
		}
	}
	return parts.join("");
}

/** 判断用户是否匹配任一用户条件 */
function matchesUser(
	author: User | undefined,
	authorId: string,
	conditions: UserCondition[],
): boolean {
	if (conditions.length === 0) return false;
	for (const c of conditions) {
		switch (c.type) {
			case "uid":
				if (authorId === c.value) return true;
				break;
			case "un":
				if (
					author?.name === c.value ||
					author?.nameShow === c.value
				)
					return true;
				break;
			case "id":
				if (author?.portrait === c.value) return true;
				break;
		}
	}
	return false;
}

// ── SSE 路由 ──────────────────────────────────────────────

export const forumSearchRoute = new Hono().get(
	"/search",
	zValidator("query", searchQuery),
	async (c) => {
		const { fname, users, keywords, sort, count, depth } =
			c.req.valid("query");

		const userConditions = parseUserConditions(users);
		const keywordList = keywords
			.split(",")
			.map((s) => s.trim())
			.filter(Boolean);

		// 至少需要一个搜索条件
		if (userConditions.length === 0 && keywordList.length === 0) {
			return c.json({ error: "请提供用户或关键词搜索条件" }, 400);
		}

		const threadCount = Math.min(Math.max(Number(count) || 100, 1), 300);
		const sortType = Number(sort) || 1;

		return streamSSE(c, async (stream) => {
			try {
				// Step 1: 按估算页数并发抓取帖子列表
				const threads = await fetchForumThreadsEnough({
					fname,
					sort: sortType,
					targetCount: threadCount,
				});

				await stream.writeSSE({
					data: JSON.stringify({
						type: "threads",
						count: threads.length,
					}),
				});

				// Step 2: 逐帖抓取 + 过滤 + 推送匹配
				const postPage =
					depth === "all" ? ([1, 10] as [number, number]) : 1;

				let totalMatches = 0;

				const postEffects = threads.map((t) =>
					pipe(
						getPosts(Number(t.id), postPage, {
							withComment: false,
						}),
						Effect.tap((result) =>
							Effect.promise(async () => {
								// 构建用户 Map
								const userMap = new Map<string, User>();
								if (result?.userList) {
									for (const u of result.userList) {
										if (u.id) userMap.set(u.id, u);
									}
								}

								const threadTitle = t.title || "无标题";
								const matched: Array<{
									tid: string;
									threadTitle: string;
									pid: string;
									floor: number;
									content: string;
									authorName: string;
									authorPortrait: string;
									time: number;
								}> = [];

								if (result?.postList) {
									for (const post of result.postList) {
										const authorId =
											post.authorId ||
											post.author?.id ||
											"";
										const author =
											post.author ??
											(authorId
												? userMap.get(authorId)
												: undefined);
										const authorName =
											author?.nameShow ||
											author?.name ||
											"";

										const text = extractText(post.content);

										// OR 逻辑：匹配用户 或 匹配任一关键词
										const isUserMatch = matchesUser(
											author,
											authorId,
											userConditions,
										);
										const isKeywordMatch =
											keywordList.length > 0 &&
											keywordList.some(
												(kw) =>
													threadTitle.includes(kw) ||
													text.includes(kw),
											);

										if (isUserMatch || isKeywordMatch) {
											matched.push({
												tid: t.id,
												threadTitle,
												pid: post.id,
												floor: post.floor,
												content: text,
												authorName,
												authorPortrait:
													author?.portrait || "",
												time: post.time,
											});
										}
									}
								}

								if (matched.length > 0) {
									totalMatches += matched.length;
									await stream.writeSSE({
										data: JSON.stringify({
											type: "match",
											posts: matched,
										}),
									});
								}

								await stream.writeSSE({
									data: JSON.stringify({
										type: "progress",
									}),
								});
							}),
						),
					),
				);

				await Effect.runPromise(
					Effect.all(postEffects, {
						concurrency: 5,
						mode: "either",
					}),
				);

				await stream.writeSSE({
					data: JSON.stringify({
						type: "done",
						stats: {
							threadsScanned: threads.length,
							totalMatches,
						},
					}),
				});
			} catch (err) {
				await stream.writeSSE({
					data: JSON.stringify({
						type: "error",
						message:
							err instanceof Error ? err.message : String(err),
					}),
				});
			}
		});
	},
);
