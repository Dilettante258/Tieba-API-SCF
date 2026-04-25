import { describeRoute, validator as zValidator } from "hono-openapi";
import {
	getPosts,
	getRawUserPost,
	getThreads,
	processUserPosts,
} from "tieba.js";
import { Effect } from "effect";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod/v4";
import { getDb } from "../db/index.ts";
import { ExportRepository } from "../export-mode/repository.ts";
import { MethodEnum, UserIdResolver } from "../utils/format.ts";

const userPostsQuery = z
	.object({
		method: z
			.enum(["uid", "id", "un"])
			.describe("用户标识类型：uid=贴吧 UID，id=用户 ID，un=用户名"),
		id: z.string().describe("对应 method 的用户标识值"),
		fromP: z.string().optional().default("1").describe("起始页（含）"),
		toP: z.string().optional().default("20").describe("结束页（含）"),
		needForumName: z
			.string()
			.optional()
			.default("true")
			.describe("是否补全贴吧名称：true/false"),
	})
	.describe("用户发帖导出参数");

const forumThreadsQuery = z
	.object({
		fname: z.string().describe("贴吧名称，例如：v吧"),
		sort: z
			.string()
			.optional()
			.default("1")
			.describe("排序方式：1=最新回复，0=最新发帖"),
		count: z
			.string()
			.optional()
			.default("50")
			.describe("导出主题数量，范围 1~300"),
		depth: z
			.enum(["first", "all"])
			.optional()
			.default("first")
			.describe("导出深度：first=仅首贴，all=抓取楼层"),
		withComments: z
			.string()
			.optional()
			.default("false")
			.describe("抓取楼层时是否包含楼中楼：true/false"),
		maxPages: z
			.string()
			.optional()
			.default("5")
			.describe("每个主题最多抓取楼层页数（depth=all 时生效）"),
	})
	.describe("贴吧主题导出参数");

const threadPostsQuery = z
	.object({
		tid: z.string().describe("主题帖 tid（帖子 ID）"),
		withComments: z
			.string()
			.optional()
			.default("false")
			.describe("是否包含楼中楼：true/false"),
	})
	.describe("单帖导出参数");

const exportJobNotificationParams = z.object({
	jobId: z.string().uuid().describe("瀵煎嚭浠诲姟 jobId"),
});

const exportJobNotificationBody = z
	.object({
		enabled: z.boolean().optional(),
		recipients: z.array(z.string().email()).optional(),
		progressIntervalMinutes: z.number().int().positive().optional(),
	})
	.refine(
		(body) =>
			body.enabled !== undefined ||
			body.recipients !== undefined ||
			body.progressIntervalMinutes !== undefined,
		{
			message:
				"enabled, recipients, progressIntervalMinutes at least one is required",
		},
	);

const TEXT_CONTENT_TYPES = new Set([0, 1, 4, 9, 18, 27, 40]);

function readAuthorName(author: unknown): string {
	if (!author || typeof author !== "object") return "";
	const row = author as Record<string, unknown>;
	return String(
		row.nameShow ?? row.name_show ?? row.user_name ?? row.name ?? "",
	);
}

function buildUserNameMap(users: unknown[] | undefined): Map<string, string> {
	const map = new Map<string, string>();
	for (const user of users ?? []) {
		if (!user || typeof user !== "object") continue;
		const row = user as Record<string, unknown>;
		const id = String(row.id ?? "");
		const name = readAuthorName(row);
		if (id && name) map.set(id, name);
	}
	return map;
}

function resolveAuthorName(
	author: unknown,
	authorId: string | undefined,
	userNameMap?: Map<string, string>,
): string {
	const id = String(authorId ?? "");
	return readAuthorName(author) || (id ? userNameMap?.get(id) : "") || id;
}

function toExportUser(user: unknown) {
	if (!user || typeof user !== "object") return null;
	const row = user as Record<string, unknown>;
	const id = String(row.id ?? "");
	if (!id) return null;
	return {
		id,
		name: String(row.name ?? ""),
		nameShow: readAuthorName(row),
		portrait: String(row.portrait ?? ""),
		levelId: Number(row.levelId ?? 0),
		ipAddress: String(row.ipAddress ?? ""),
	};
}

function toText(
	content: Array<{ type: number; text?: string; c?: string }> | undefined,
): string {
	if (!content || content.length === 0) return "";
	return content
		.map((item) => {
			if (TEXT_CONTENT_TYPES.has(item.type)) return item.text ?? "";
			if (item.type === 2 || item.type === 11)
				return item.c ? `#(${item.c})` : "";
			if (item.type === 3 || item.type === 20) return "[图片]";
			if (item.type === 5) return "[视频]";
			if (item.type === 10) return "[语音]";
			return "";
		})
		.join("")
		.trim();
}

function toThreadPost(
	post: {
		id: string;
		floor: number;
		time: number;
		authorId?: string;
		content: Array<{ type: number; text?: string; c?: string }>;
		agree?:
			| { agreeNum?: string | number; agree_num?: string | number }
			| undefined;
		author?: unknown;
		subPostList?:
			| {
					subPostList: Array<{
						id: string;
						floor: number;
						time: number;
						authorId?: string;
						content: Array<{ type: number; text?: string; c?: string }>;
						agree?:
							| {
									agreeNum?: string | number;
									agree_num?: string | number;
							  }
							| undefined;
						author?: unknown;
					}>;
			  }
			| undefined;
	},
	userNameMap?: Map<string, string>,
) {
	return {
		pid: post.id,
		floor: post.floor,
		authorId: String(post.authorId ?? ""),
		authorName: resolveAuthorName(post.author, post.authorId, userNameMap),
		content: toText(post.content),
		agreeNum: Number(post.agree?.agreeNum ?? post.agree?.agree_num ?? 0),
		time: post.time,
		comments: (post.subPostList?.subPostList ?? []).map((sub) => ({
			pid: sub.id,
			floor: sub.floor,
			authorId: String(sub.authorId ?? ""),
			authorName: resolveAuthorName(sub.author, sub.authorId, userNameMap),
			content: toText(sub.content),
			agreeNum: Number(sub.agree?.agreeNum ?? sub.agree?.agree_num ?? 0),
			time: sub.time,
		})),
	};
}

function dedupeThreadPosts<
	T extends { pid?: string; floor?: number; time?: number; content?: string },
>(posts: T[]): T[] {
	const seen = new Set<string>();
	const unique: T[] = [];

	for (const post of posts) {
		const key = `${post.pid ?? ""}_${post.floor ?? 0}_${post.time ?? 0}_${post.content ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(post);
	}

	return unique;
}

export const exportRoute = new Hono()
	.get(
		"/userPosts",
		describeRoute({
			tags: ["export"],
			summary: "导出用户发帖",
			description: "按页范围抓取用户发帖并通过 SSE 输出进度与结果。",
			responses: {
				200: {
					description: "SSE 流式返回导出进度和结果",
				},
			},
		}),
		zValidator("query", userPostsQuery),
		async (c) => {
			const { method, id, fromP, toP, needForumName } = c.req.valid("query");
			const from = Math.max(1, Number(fromP) || 1);
			const to = Math.max(from, Number(toP) || from);
			const total = to - from + 1;
			const needForum = needForumName !== "false";

			return streamSSE(c, async (stream) => {
				try {
					const uid = await UserIdResolver.resolve(method, id, MethodEnum.id);
					const rawPosts: unknown[] = [];
					let pageDone = 0;

					for (let p = from; p <= to; p++) {
						const pageData = await Effect.runPromise(getRawUserPost(uid, p));
						pageDone += 1;
						await stream.writeSSE({
							data: JSON.stringify({
								type: "progress",
								page: pageDone,
								total,
							}),
						});
						if (!Array.isArray(pageData) || pageData.length === 0) break;
						rawPosts.push(...(pageData as unknown[]));
					}

					const data = await Effect.runPromise(
						processUserPosts(rawPosts as any[], needForum),
					);
					await stream.writeSSE({
						data: JSON.stringify({ type: "done", data }),
					});
				} catch (err) {
					await stream.writeSSE({
						data: JSON.stringify({
							type: "error",
							message: err instanceof Error ? err.message : String(err),
						}),
					});
				}
			});
		},
	)
	.get(
		"/forumThreads",
		describeRoute({
			tags: ["export"],
			summary: "导出贴吧主题",
			description: "抓取贴吧主题，可选展开楼层内容，使用 SSE 返回进度和结果。",
			responses: {
				200: {
					description: "SSE 流式返回导出进度和结果",
				},
			},
		}),
		zValidator("query", forumThreadsQuery),
		async (c) => {
			const { fname, sort, count, depth, withComments, maxPages } =
				c.req.valid("query");
			const includeComments = withComments === "true";
			const threadCount = Math.min(Math.max(Number(count) || 50, 1), 300);
			const maxThreadPostPages = Math.min(
				Math.max(Number(maxPages) || 5, 1),
				20,
			);
			const pages = Math.ceil(threadCount / 30);
			const sortType = Number(sort) || 1;

			return streamSSE(c, async (stream) => {
				try {
					const pageResults = await Effect.runPromise(
						Effect.all(
							Array.from({ length: pages }, (_, i) =>
								getThreads({ fname, page: i + 1, sort: sortType, rn: 30 }),
							),
							{ concurrency: 5 },
						),
					);
					let threads = pageResults.flatMap((res) => res?.threadList ?? []);
					threads = threads
						.filter((thread) => !thread.isTop)
						.slice(0, threadCount);

					await stream.writeSSE({
						data: JSON.stringify({
							type: "threads",
							count: threads.length,
						}),
					});

					const threadData: Array<Record<string, unknown>> = [];
					const usersMap = new Map<string, ReturnType<typeof toExportUser>>();
					if (depth === "all") {
						let done = 0;
						for (const thread of threads) {
							try {
								const postsRes = await Effect.runPromise(
									getPosts(Number(thread.id), [1, maxThreadPostPages], {
										withComment: includeComments,
									}),
								);
								for (const user of postsRes?.userList ?? []) {
									const normalized = toExportUser(user);
									if (normalized) usersMap.set(normalized.id, normalized);
								}
								const userNameMap = buildUserNameMap(postsRes?.userList);
								const posts = dedupeThreadPosts(
									(postsRes?.postList ?? []).map((post) =>
										toThreadPost(post, userNameMap),
									),
								);
								threadData.push({
									tid: thread.id,
									title: thread.title,
									authorName:
										readAuthorName(thread.author) || thread.authorId || "",
									replyNum: thread.replyNum,
									viewNum: thread.viewNum,
									createTime: thread.createTime,
									content: posts.map((p) => p.content).join("\n"),
									posts,
								});
							} catch {
								threadData.push({
									tid: thread.id,
									title: thread.title,
									authorName:
										readAuthorName(thread.author) || thread.authorId || "",
									replyNum: thread.replyNum,
									viewNum: thread.viewNum,
									createTime: thread.createTime,
									content: "",
									posts: [],
								});
							}
							done += 1;
							await stream.writeSSE({
								data: JSON.stringify({
									type: "post",
									current: done,
									total: threads.length,
								}),
							});
						}
					} else {
						for (const thread of threads) {
							threadData.push({
								tid: thread.id,
								title: thread.title,
								authorName:
									readAuthorName(thread.author) || thread.authorId || "",
								replyNum: thread.replyNum,
								viewNum: thread.viewNum,
								createTime: thread.createTime,
								content: toText(thread.firstPostContent),
							});
						}
					}

					await stream.writeSSE({
						data: JSON.stringify({
							type: "done",
							data: {
								threads: threadData,
								users: Array.from(usersMap.values()).filter(
									(row): row is NonNullable<typeof row> => !!row,
								),
							},
						}),
					});
				} catch (err) {
					await stream.writeSSE({
						data: JSON.stringify({
							type: "error",
							message: err instanceof Error ? err.message : String(err),
						}),
					});
				}
			});
		},
	)
	.get(
		"/threadPosts",
		describeRoute({
			tags: ["export"],
			summary: "导出单贴楼层",
			description: "抓取单个主题帖所有楼层并通过 SSE 返回进度。",
			responses: {
				200: {
					description: "SSE 流式返回导出进度和结果",
				},
				400: {
					description: "tid 参数无效",
				},
			},
		}),
		zValidator("query", threadPostsQuery),
		async (c) => {
			const { tid, withComments } = c.req.valid("query");
			const threadId = Number(tid) || 0;
			if (!threadId) return c.json({ message: "tid 参数无效" }, 400);

			return streamSSE(c, async (stream) => {
				try {
					const includeComments = withComments === "true";
					const firstPage = await Effect.runPromise(
						getPosts(threadId, 1, {
							withComment: includeComments,
						}),
					);
					const total = Math.max(firstPage?.page?.totalPage ?? 1, 1);
					const userNameMap = buildUserNameMap(firstPage?.userList);
					const usersMap = new Map<string, ReturnType<typeof toExportUser>>();
					for (const user of firstPage?.userList ?? []) {
						const normalized = toExportUser(user);
						if (normalized) usersMap.set(normalized.id, normalized);
					}

					const posts = (firstPage?.postList ?? []).map((post) =>
						toThreadPost(post, userNameMap),
					);
					await stream.writeSSE({
						data: JSON.stringify({
							type: "progress",
							page: 1,
							total,
						}),
					});

					for (let page = 2; page <= total; page++) {
						const pageRes = await Effect.runPromise(
							getPosts(threadId, page, {
								withComment: includeComments,
							}),
						);
						for (const user of pageRes?.userList ?? []) {
							const row = user as unknown as Record<string, unknown>;
							const id = String(row.id ?? "");
							const name = readAuthorName(row);
							if (id && name) userNameMap.set(id, name);
							const normalized = toExportUser(row);
							if (normalized) usersMap.set(normalized.id, normalized);
						}
						posts.push(
							...(pageRes?.postList ?? []).map((post) =>
								toThreadPost(post, userNameMap),
							),
						);
						await stream.writeSSE({
							data: JSON.stringify({
								type: "progress",
								page,
								total,
							}),
						});
					}

					await stream.writeSSE({
						data: JSON.stringify({
							type: "done",
							data: {
								thread: firstPage?.thread,
								posts,
								users: Array.from(usersMap.values()).filter(
									(row): row is NonNullable<typeof row> => !!row,
								),
							},
						}),
					});
				} catch (err) {
					await stream.writeSSE({
						data: JSON.stringify({
							type: "error",
							message: err instanceof Error ? err.message : String(err),
						}),
					});
				}
			});
		},
	)
	.patch(
		"/jobs/:jobId/notifications",
		describeRoute({
			tags: ["export"],
			summary: "更新导出任务通知配置",
			description: "更新导出任务的通知开关、收件人和进度通知间隔。",
			responses: {
				200: {
					description: "更新后的通知配置。",
				},
				404: {
					description: "任务不存在。",
				},
			},
		}),
		zValidator("param", exportJobNotificationParams),
		zValidator("json", exportJobNotificationBody),
		async (c) => {
			const { jobId } = c.req.valid("param");
			const body = c.req.valid("json");
			const repo = new ExportRepository(getDb());
			const notification = await repo.updateJobNotification(jobId, body);

			if (!notification) {
				return c.json({ message: "export job not found" }, 404);
			}

			return c.json({
				jobId,
				...notification,
				lastProgressSentAt: notification.lastProgressSentAt?.toISOString() ?? null,
				lastEventSentAt: notification.lastEventSentAt?.toISOString() ?? null,
			});
		},
	);
