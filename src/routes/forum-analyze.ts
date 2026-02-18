import { zValidator } from "@hono/zod-validator";
import { getPosts, getThreads } from "@tieba/sdk";
import { Effect, Either, pipe } from "effect";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";

// ── 请求参数 ──────────────────────────────────────────────

const analyzeQuery = z.object({
	fname: z.string(),
	sort: z.string().optional().default("1"),
	count: z.string().optional().default("50"),
	depth: z.enum(["first", "all"]).optional().default("first"),
});

// ── 中文分词器（模块级单例） ─────────────────────────────

const segmenter = new Intl.Segmenter("zh", { granularity: "word" });

/** PbContent 中的文本类型 */
const TEXT_CONTENT_TYPES = new Set([0, 1, 4, 9, 18, 27, 40]);

/** 常见停用词（单字虚词、标点等） */
const STOP_WORDS = new Set([
	"的", "了", "是", "在", "我", "有", "和", "就", "不", "人",
	"都", "一", "一个", "上", "也", "很", "到", "说", "要", "去",
	"你", "会", "着", "没有", "看", "好", "自己", "这", "他", "她",
	"吗", "那", "它", "被", "从", "把", "让", "用", "对", "为",
	"这个", "那个", "什么", "怎么", "可以", "没", "能", "但", "而",
	"与", "或", "如", "因为", "所以", "但是", "如果", "虽然", "还是",
	"已经", "还", "又", "再", "才", "只", "啊", "吧", "呢", "嗯",
	"哦", "哈", "哈哈", "真的", "知道", "觉得", "然后", "这样",
]);

/** 对文本分词并累加词频（过滤停用词、单字、纯数字/标点） */
function countWords(text: string, counts: Map<string, number>) {
	for (const { segment, isWordLike } of segmenter.segment(text)) {
		if (!isWordLike) continue;
		const word = segment.trim();
		if (word.length <= 1 || STOP_WORDS.has(word)) continue;
		// 跳过纯数字
		if (/^\d+$/.test(word)) continue;
		counts.set(word, (counts.get(word) ?? 0) + 1);
	}
}

// ── IP 属地清洗 ──────────────────────────────────────────

function cleanIpAddress(raw: string): string {
	const cleaned = raw.replace(/^IP属地[:：]?\s*/, "").trim();
	return cleaned || "未知";
}

// ── 数据聚合 ──────────────────────────────────────────────

// 从 SDK 推断帖子列表和帖子回复的类型
type ThreadsResult = Effect.Effect.Success<ReturnType<typeof getThreads>>;
type ThreadInfo = NonNullable<ThreadsResult>["threadList"][number];
type PostsResult = Effect.Effect.Success<ReturnType<typeof getPosts>>;
type Post = NonNullable<PostsResult>["postList"][number];
type User = NonNullable<PostsResult>["userList"][number];

function aggregate(
	fname: string,
	threads: ThreadInfo[],
	allPosts: Post[],
	allUsers: User[],
) {
	// 构建用户 Map（authorId → User）
	const userMap = new Map<string, User>();
	for (const u of allUsers) {
		if (u.id) userMap.set(u.id, u);
	}
	for (const p of allPosts) {
		if (p.author?.id) userMap.set(p.author.id, p.author);
	}

	const ipCount = new Map<string, number>();
	// 每个地区的用户发帖计数：region → Map<authorId, { name, count }>
	const ipUserMap = new Map<
		string,
		Map<string, { name: string; count: number }>
	>();
	// 每个用户的 IP 集合：authorId → Set<region>
	const userIpSet = new Map<string, Set<string>>();

	const levelCount = new Map<number, number>();
	const timeData: Array<{ date: number; hour: number }> = [];
	const userPostCount = new Map<
		string,
		{ name: string; count: number; portrait: string }
	>();
	const uniqueUserIds = new Set<string>();

	for (const post of allPosts) {
		const authorId = post.authorId || post.author?.id || "";
		const author =
			post.author ?? (authorId ? userMap.get(authorId) : undefined);

		if (authorId) uniqueUserIds.add(authorId);

		// IP 统计 + 每地区用户 + 用户 IP 追踪
		if (author?.ipAddress) {
			const ip = cleanIpAddress(author.ipAddress);
			ipCount.set(ip, (ipCount.get(ip) ?? 0) + 1);

			if (authorId) {
				const userName = author.nameShow || author.name || authorId;
				// 每地区用户计数
				let regionUsers = ipUserMap.get(ip);
				if (!regionUsers) {
					regionUsers = new Map();
					ipUserMap.set(ip, regionUsers);
				}
				const ru = regionUsers.get(authorId);
				if (ru) ru.count++;
				else regionUsers.set(authorId, { name: userName, count: 1 });

				// 用户 IP 集合
				let ips = userIpSet.get(authorId);
				if (!ips) {
					ips = new Set();
					userIpSet.set(authorId, ips);
				}
				ips.add(ip);
			}
		}

		// 等级统计
		const level = author?.userGrowth?.levelId ?? author?.levelId ?? 0;
		if (level > 0) {
			levelCount.set(level, (levelCount.get(level) ?? 0) + 1);
		}

		// 时间分布
		if (post.time) {
			const d = new Date(post.time * 1000);
			timeData.push({
				date: post.time,
				hour: d.getHours() + d.getMinutes() / 60,
			});
		}

		// 用户发帖计数
		if (authorId && author) {
			const existing = userPostCount.get(authorId);
			if (existing) {
				existing.count++;
			} else {
				userPostCount.set(authorId, {
					name: author.nameShow || author.name || authorId,
					count: 1,
					portrait: author.portrait || "",
				});
			}
		}
	}

	// IP 分布（按数量降序），附带该地区发言最多的 5 个用户
	const ipDistribution = [...ipCount.entries()]
		.map(([name, value]) => {
			const regionUsers = ipUserMap.get(name);
			const topUsers = regionUsers
				? [...regionUsers.values()]
						.sort((a, b) => b.count - a.count)
						.slice(0, 5)
						.map((u) => u.name)
				: [];
			return { name, value, topUsers };
		})
		.sort((a, b) => b.value - a.value);

	// 等级分布（补全 Lv.1 ~ Lv.18）
	const levelDistribution = Array.from({ length: 18 }, (_, i) => ({
		name: `Lv.${i + 1}`,
		value: levelCount.get(i + 1) ?? 0,
	}));

	// 活跃用户 Top 30
	const topUsers = [...userPostCount.values()]
		.sort((a, b) => b.count - a.count)
		.slice(0, 30)
		.map((u) => ({ name: u.name, value: u.count, portrait: u.portrait }));

	// 帖子热度
	const threadHeat = threads.map((t) => {
		const aid = t.authorId || t.author?.id || "";
		const u = aid ? userMap.get(aid) : undefined;
		const author =
			t.author?.nameShow || t.author?.name ||
			u?.nameShow || u?.name || "";
		return {
			title: t.title || "无标题",
			tid: t.id,
			author,
			replyNum: t.replyNum,
			viewNum: t.viewNum,
			agreeNum: Number(t.agree?.agreeNum ?? 0),
		};
	});

	// 词频统计（用于词云）
	const wordCount = new Map<string, number>();
	// 收集帖子标题文本
	for (const t of threads) {
		if (t.title) countWords(t.title, wordCount);
	}
	// 收集帖子内容文本
	for (const post of allPosts) {
		if (!post.content) continue;
		for (const c of post.content) {
			if (TEXT_CONTENT_TYPES.has(c.type) && c.text) {
				countWords(c.text, wordCount);
			}
		}
	}
	// 词数与回复量成正比，最少 200，最多 600
	const wordLimit = Math.min(Math.max(allPosts.length, 200), 600);
	const wordCloud = [...wordCount.entries()]
		.map(([name, value]) => ({ name, value }))
		.sort((a, b) => b.value - a.value)
		.slice(0, wordLimit);

	// IP 变动用户（发帖使用过多个 IP 属地）
	const ipChangedUsers = [...userIpSet.entries()]
		.filter(([, ips]) => ips.size > 1)
		.map(([authorId, ips]) => {
			const u = userPostCount.get(authorId);
			return {
				name: u?.name ?? authorId,
				portrait: u?.portrait ?? "",
				ips: [...ips],
				postCount: u?.count ?? 0,
			};
		})
		.sort((a, b) => b.postCount - a.postCount);

	return {
		meta: {
			fname,
			threadCount: threads.length,
			postCount: allPosts.length,
			uniqueUsers: uniqueUserIds.size,
		},
		ipDistribution,
		levelDistribution,
		timeDistribution: timeData,
		topUsers,
		threadHeat,
		wordCloud,
		ipChangedUsers,
	};
}

// ── SSE 路由 ──────────────────────────────────────────────

export const forumAnalyzeRoute = new Hono().get(
	"/analyze",
	zValidator("query", analyzeQuery),
	async (c) => {
		const { fname, sort, count, depth } = c.req.valid("query");
		const threadCount = Math.min(Math.max(Number(count) || 50, 1), 300);
		const pages = Math.ceil(threadCount / 30);

		return streamSSE(c, async (stream) => {
			try {
				// Step 1: 并发抓取帖子列表
				const pageEffects = Array.from({ length: pages }, (_, i) =>
					getThreads({
						fname,
						page: i + 1,
						sort: Number(sort) || 1,
						rn: 30,
					}),
				);
				const pageResults = await Effect.runPromise(
					Effect.all(pageEffects, { concurrency: 5 }),
				);
				let threads = pageResults.flatMap(
					(r) => r?.threadList ?? [],
				);
				threads = threads.filter((t) => !t.isTop).slice(0, threadCount);

				await stream.writeSSE({
					data: JSON.stringify({
						type: "threads",
						count: threads.length,
					}),
				});

				// Step 2: 并发抓取帖子内容（每个帖子最多 5 页）
				const postPage =
					depth === "all" ? ([1, 5] as [number, number]) : 1;

				const allPosts: Post[] = [];
				const allUsers: User[] = [];

				const postEffects = threads.map((t) =>
					pipe(
						getPosts(Number(t.id), postPage, {
							withComment: false,
						}),
						Effect.tap(() =>
							Effect.promise(() =>
								stream.writeSSE({
									data: JSON.stringify({ type: "post" }),
								}),
							),
						),
					),
				);

				const postResults = await Effect.runPromise(
					Effect.all(postEffects, {
						concurrency: 5,
						mode: "either",
					}),
				);

				for (const r of postResults) {
					if (Either.isRight(r) && r.right) {
						if (r.right.postList)
							allPosts.push(...r.right.postList);
						if (r.right.userList)
							allUsers.push(...r.right.userList);
					}
				}

				// Step 3: 聚合并返回
				const result = aggregate(fname, threads, allPosts, allUsers);
				await stream.writeSSE({
					data: JSON.stringify({ type: "done", data: result }),
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
