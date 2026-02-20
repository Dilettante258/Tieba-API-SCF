import { describeRoute, validator as zValidator } from "hono-openapi";
import { getPosts } from "tieba.js";
import { Effect, Either, pipe } from "effect";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod/v4";
import {
	fetchForumThreadsEnough,
	type ForumThreadInfo,
} from "../lib/forum-threads.ts";

// ── 请求参数 ──────────────────────────────────────────────

const analyzeQuery = z
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
			.describe("扫描主题数量，范围 1~300"),
		depth: z
			.enum(["first", "all"])
			.optional()
			.default("first")
			.describe("抓取深度：first=仅首层，all=抓取更多楼层"),
		// 热门吧友权重
		tw: z
			.string()
			.optional()
			.default("5")
			.describe("热门吧友评分中的主题帖权重"),
		rw: z
			.string()
			.optional()
			.default("1")
			.describe("热门吧友评分中的回复数权重"),
		aw: z
			.string()
			.optional()
			.default("0.5")
			.describe("热门吧友评分中的获赞数权重"),
	})
	.describe("贴吧综合分析参数");

// ── 中文分词器（模块级单例） ─────────────────────────────

const segmenter = new Intl.Segmenter("zh", { granularity: "word" });

/** PbContent 中的文本类型 */
const TEXT_CONTENT_TYPES = new Set([0, 1, 4, 9, 18, 27, 40]);

/** 常见停用词（单字虚词、标点等） */
const STOP_WORDS = new Set([
	"的",
	"了",
	"是",
	"在",
	"我",
	"有",
	"和",
	"就",
	"不",
	"人",
	"都",
	"一",
	"一个",
	"上",
	"也",
	"很",
	"到",
	"说",
	"要",
	"去",
	"你",
	"会",
	"着",
	"没有",
	"看",
	"好",
	"自己",
	"这",
	"他",
	"她",
	"吗",
	"那",
	"它",
	"被",
	"从",
	"把",
	"让",
	"用",
	"对",
	"为",
	"这个",
	"那个",
	"什么",
	"怎么",
	"可以",
	"没",
	"能",
	"但",
	"而",
	"与",
	"或",
	"如",
	"因为",
	"所以",
	"但是",
	"如果",
	"虽然",
	"还是",
	"已经",
	"还",
	"又",
	"再",
	"才",
	"只",
	"啊",
	"吧",
	"呢",
	"嗯",
	"哦",
	"哈",
	"哈哈",
	"真的",
	"知道",
	"觉得",
	"然后",
	"这样",
	"一下",
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

// 从 SDK 推断帖子回复的类型
type ThreadInfo = ForumThreadInfo;
type PostsResult = Effect.Effect.Success<ReturnType<typeof getPosts>>;
type Post = NonNullable<PostsResult>["postList"][number];
type User = NonNullable<PostsResult>["userList"][number];

function aggregate(
	fname: string,
	threads: ThreadInfo[],
	allPosts: Post[],
	allUsers: User[],
	weights: { thread: number; reply: number; agree: number },
	postTids: string[],
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
	const postTimes: Array<{ time: number; isThread: boolean }> = [];
	const userPostCount = new Map<
		string,
		{
			name: string;
			count: number;
			portrait: string;
			threadCount: number;
			totalAgrees: number;
		}
	>();
	// 点赞数最多的帖子候选
	const likedPostCandidates: Array<{
		tid: string;
		floor: number;
		author: string;
		content: string;
		agreeNum: number;
	}> = [];
	// 回复最多的回复候选（楼中楼数）
	const repliedReplyCandidates: Array<{
		tid: string;
		floor: number;
		author: string;
		content: string;
		subPostNumber: number;
	}> = [];
	const uniqueUserIds = new Set<string>();

	for (let postIdx = 0; postIdx < allPosts.length; postIdx++) {
		const post = allPosts[postIdx];
		const postTid = postTids[postIdx] ?? post.tid;
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
			postTimes.push({
				time: post.time,
				isThread: post.floor === 1,
			});
		}

		// 提取文本摘要（点赞候选和回复候选共用）
		const agreeNum = Number(post.agree?.agreeNum ?? 0);
		const authorName = author?.nameShow || author?.name || authorId || "";
		let excerpt = "";
		if (post.content) {
			for (const c of post.content) {
				if (TEXT_CONTENT_TYPES.has(c.type) && c.text) {
					excerpt += c.text;
					if (excerpt.length >= 80) break;
				}
			}
		}
		const excerptText = excerpt.slice(0, 80);

		// 点赞帖子候选
		if (agreeNum > 0) {
			likedPostCandidates.push({
				tid: postTid,
				floor: post.floor,
				author: authorName,
				content: excerptText,
				agreeNum,
			});
		}

		// 回复最多的回复候选（楼中楼数 > 0 的非主题贴）
		if (post.floor > 1 && post.subPostNumber > 0) {
			repliedReplyCandidates.push({
				tid: postTid,
				floor: post.floor,
				author: authorName,
				content: excerptText,
				subPostNumber: post.subPostNumber,
			});
		}

		// 用户发帖计数
		if (authorId && author) {
			const existing = userPostCount.get(authorId);
			if (existing) {
				existing.count++;
				if (post.floor === 1) existing.threadCount++;
				existing.totalAgrees += agreeNum;
			} else {
				userPostCount.set(authorId, {
					name: author.nameShow || author.name || authorId,
					count: 1,
					portrait: author.portrait || "",
					threadCount: post.floor === 1 ? 1 : 0,
					totalAgrees: agreeNum,
				});
			}
		}
	}

	// ── 时间分布模式计算 ──
	// 按时间排序，用 IQR 方法丢弃离群旧数据
	const sortedTimes = postTimes.map((p) => p.time).sort((a, b) => a - b);
	let lowerBound = sortedTimes[0] ?? 0;
	if (sortedTimes.length > 20) {
		const p10 = sortedTimes[Math.floor(sortedTimes.length * 0.1)];
		const p90 = sortedTimes[Math.floor(sortedTimes.length * 0.9)];
		const iqr = p90 - p10;
		const bound = p10 - iqr * 1.5;
		if (bound > lowerBound) lowerBound = bound;
	}
	const filteredPosts = postTimes.filter((p) => p.time >= lowerBound);
	const fTimes = filteredPosts.map((p) => p.time).sort((a, b) => a - b);
	const timeSpan =
		fTimes.length > 1 ? fTimes[fTimes.length - 1] - fTimes[0] : 0;
	const timeMode = timeSpan / 86400 <= 3 ? ("hour" as const) : ("day" as const);

	const timeDistData = filteredPosts.map((p) => {
		const d = new Date(p.time * 1000);
		const type = p.isThread ? "主题贴" : "回复";
		const value = p.isThread ? -1 : 1;
		// 返回原始毫秒时间戳，前端按粒度（5分/15分/1小时/1天）分桶
		return {
			time: d.getTime(),
			type,
			value,
		};
	});

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
			return { name, value, topUsers, userCount: regionUsers?.size ?? 0 };
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
			t.author?.nameShow || t.author?.name || u?.nameShow || u?.name || "";
		return {
			title: t.title || "无标题",
			tid: t.id,
			author,
			replyNum: t.replyNum,
			viewNum: t.viewNum,
			agreeNum: Number(t.agree?.agreeNum ?? 0),
		};
	});

	// 点赞最多的帖子 Top 40（附带所属主题标题，前端按帖子/回复分类展示）
	const threadTitleMap = new Map<string, string>();
	for (const t of threads) {
		threadTitleMap.set(t.id, t.title || "无标题");
	}
	const topLikedPosts = likedPostCandidates
		.sort((a, b) => b.agreeNum - a.agreeNum)
		.slice(0, 40)
		.map((p) => ({
			...p,
			title: threadTitleMap.get(p.tid) ?? "无标题",
		}));

	// 回复最多的回复 Top 20（按楼中楼数排序）
	const topRepliedReplies = repliedReplyCandidates
		.sort((a, b) => b.subPostNumber - a.subPostNumber)
		.slice(0, 20)
		.map((p) => ({
			...p,
			title: threadTitleMap.get(p.tid) ?? "无标题",
		}));

	// 热门吧友：score = threadCount × tw + replyCount × rw + totalAgrees × aw
	const hotUsers = [...userPostCount.values()]
		.map((u) => {
			const replyCount = u.count - u.threadCount;
			const score =
				u.threadCount * weights.thread +
				replyCount * weights.reply +
				u.totalAgrees * weights.agree;
			return {
				name: u.name,
				portrait: u.portrait,
				threadCount: u.threadCount,
				replyCount,
				totalAgrees: u.totalAgrees,
				score: Math.round(score),
			};
		})
		.sort((a, b) => b.score - a.score)
		.slice(0, 30);

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
		timeDistribution: { mode: timeMode, data: timeDistData },
		topUsers,
		threadHeat,
		topLikedPosts,
		topRepliedReplies,
		hotUsers,
		wordCloud,
		ipChangedUsers,
	};
}

// ── SSE 路由 ──────────────────────────────────────────────

export const forumAnalyzeRoute = new Hono().get(
	"/analyze",
	describeRoute({
		tags: ["forum"],
		summary: "贴吧综合分析",
		description:
			"聚合指定贴吧的主题、回复、用户、IP、等级、词频等数据，使用 SSE 流式返回处理进度和最终分析结果。",
		responses: {
			200: {
				description: "SSE 流式返回分析进度和结果",
			},
		},
	}),
	zValidator("query", analyzeQuery),
	async (c) => {
		const { fname, sort, count, depth, tw, rw, aw } = c.req.valid("query");
		const threadCount = Math.min(Math.max(Number(count) || 50, 1), 300);
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

				// Step 2: 并发抓取帖子内容（每个帖子最多 5 页）
				const postPage = depth === "all" ? ([1, 5] as [number, number]) : 1;

				const allPosts: Post[] = [];
				const allUsers: User[] = [];
				const allPostTids: string[] = [];

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

				for (let i = 0; i < postResults.length; i++) {
					const r = postResults[i];
					if (Either.isRight(r) && r.right) {
						const tid = threads[i].id;
						if (r.right.postList) {
							for (const _ of r.right.postList) allPostTids.push(tid);
							allPosts.push(...r.right.postList);
						}
						if (r.right.userList) allUsers.push(...r.right.userList);
					}
				}

				// Step 3: 聚合并返回
				const weights = {
					thread: Number(tw) || 5,
					reply: Number(rw) || 1,
					agree: Number(aw) || 0.5,
				};
				const result = aggregate(
					fname,
					threads,
					allPosts,
					allUsers,
					weights,
					allPostTids,
				);
				await stream.writeSSE({
					data: JSON.stringify({ type: "done", data: result }),
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
);
