import { describeRoute, validator as zValidator } from "hono-openapi";
import {
	getFans,
	getFollow,
	getHiddenLikeForum,
	getLikeForum,
	getPanel,
	getProfile,
	getUserInfo,
	getUserPost,
} from "tieba.js";
import { Effect } from "effect";
import { Hono } from "hono";
import { z } from "zod/v4";
import { MethodEnum, UserIdResolver } from "../utils/format.ts";

const methodSpec = z
	.object({
		method: z
			.enum(["uid", "id", "un"])
			.describe("用户标识类型：uid=贴吧 UID，id=用户 ID，un=用户名"),
		id: z.string().describe("对应 method 的用户标识值"),
	})
	.describe("用户标识参数");

const methodWithPage = methodSpec
	.extend({
		page: z
			.string()
			.optional()
			.default("1")
			.describe("页码；follow/fan 接口可传 ALL 拉取全部"),
	})
	.describe("带分页的用户查询参数");

const methodWithRange = methodSpec
	.extend({
		fromP: z.string().describe("起始页（含）"),
		toP: z.string().describe("结束页（含）"),
	})
	.describe("分页区间参数");

export const userRoute = new Hono()
	.get(
		"/info",
		describeRoute({
			tags: ["user"],
			summary: "获取用户基础信息",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", methodSpec),
		async (c) => {
			const { method, id } = c.req.valid("query");
			const un = await UserIdResolver.resolve(method, id, MethodEnum.un);
			const res = await Effect.runPromise(getUserInfo(un));
			return c.json(res);
		},
	)
	.get(
		"/posts",
		describeRoute({
			tags: ["user"],
			summary: "获取用户发帖列表",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", methodWithPage),
		async (c) => {
			const { method, id, page } = c.req.valid("query");
			const userId = await UserIdResolver.resolve(method, id, MethodEnum.id);
			const res = await Effect.runPromise(getUserPost(userId, Number(page)));
			return c.json(res);
		},
	)
	.get(
		"/postsBatch",
		describeRoute({
			tags: ["user"],
			summary: "批量获取用户发帖",
			description: "按页码区间抓取用户发帖记录。",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", methodWithRange),
		async (c) => {
			const { method, id, fromP, toP } = c.req.valid("query");
			const userId = await UserIdResolver.resolve(method, id, MethodEnum.id);
			const res = await Effect.runPromise(
				getUserPost(userId, [Number(fromP), Number(toP)]),
			);
			return c.json(res);
		},
	)
	.get(
		"/profile",
		describeRoute({
			tags: ["user"],
			summary: "获取用户主页资料",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", methodSpec),
		async (c) => {
			const { method, id } = c.req.valid("query");
			const userId = await UserIdResolver.resolve(method, id, MethodEnum.id);
			const res = await Effect.runPromise(getProfile(userId));
			return c.json(res);
		},
	)
	.get(
		"/panel",
		describeRoute({
			tags: ["user"],
			summary: "获取用户面板信息",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", methodSpec),
		async (c) => {
			const { method, id } = c.req.valid("query");
			const un = await UserIdResolver.resolve(method, id, MethodEnum.un);
			const res = await Effect.runPromise(getPanel(un));
			return c.json(res);
		},
	)
	.get(
		"/likeForum",
		describeRoute({
			tags: ["user"],
			summary: "获取用户关注贴吧",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", methodSpec),
		async (c) => {
			const { method, id } = c.req.valid("query");
			const userId = await UserIdResolver.resolve(method, id, MethodEnum.id);
			const list = await Effect.runPromise(getLikeForum(userId, "ALL"));
			// 列表为空时，用户可能隐藏了关注贴吧，从 profile + panel 恢复部分信息
			const hidden =
				list.length === 0
					? await Effect.runPromise(getHiddenLikeForum(userId))
					: null;
			return c.json({ list, hidden });
		},
	)
	.get(
		"/condenseProfile",
		describeRoute({
			tags: ["user"],
			summary: "获取浓缩用户画像",
			description: "聚合 profile、panel 等信息，返回简化用户档案。",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", methodSpec),
		async (c) => {
			const { method, id } = c.req.valid("query");
			const userId = await UserIdResolver.resolve(method, id, MethodEnum.id);
			const profile = await Effect.runPromise(getProfile(userId));
			const user = profile?.user;
			const name = user?.name ?? method === 'un' ? id : "";
			const panel = await Effect.runPromise(getPanel(name));

			// 从 portrait 字符串末尾提取头像上传时间戳
			const portraitStr = user?.portrait ?? "";
			const tsMatch = portraitStr.match(/=(\d+)$/);
			const ageTimestamp = tsMatch ? Number(tsMatch[1]) : undefined;

			// 解析吧务信息（吧主 + 小吧主）
			const managerInfo: { role: string; forums: string[] }[] = [];
			const honor = panel.honor?.manager;
			if (honor?.manager?.forum_list?.length) {
				managerInfo.push({ role: "吧主", forums: honor.manager.forum_list });
			}
			if (honor?.assist?.forum_list?.length) {
				managerInfo.push({ role: "小吧主", forums: honor.assist.forum_list });
			}

			// 解析等级信息
			const gradeInfo: { level: string; forums: string[] }[] = [];
			const grade = panel.honor?.grade;
			if (grade) {
				for (const [level, info] of Object.entries(grade)) {
					if (info.forum_list?.length) {
						gradeInfo.push({ level, forums: info.forum_list });
					}
				}
			}

			// 隐私设置映射
			const privSets = user?.privSets;
			const privacy = privSets
				? {
						location: privSets.location,
						like: privSets.like,
						post: privSets.post,
						friend: privSets.friend,
					}
				: undefined;

			return c.json({
				name,
				nickname: user?.nameShow,
				intro: user?.intro,
				id: user?.id,
				uid: user?.tiebaUid,
				portrait: portraitStr,
				ageTimestamp,
				fan: user?.fansNum,
				follow: user?.concernNum,
				sex: user?.sex,
				godData: user?.newGodData?.fieldName,
				ipAddress: user?.ipAddress,
				userGrowth: user?.userGrowth?.levelId,
				totalAgreeNum: profile?.userAgreeInfo?.totalAgreeNum,
				myLikeNum: user?.myLikeNum,
				tbAge: user?.tbAge,
				postNum: user?.postNum,
				tbVip: panel.tb_vip,
				vip: panel.vipInfo
					? {
							level: panel.vipInfo.v_level ?? "0",
							status: panel.vipInfo.v_status ?? "0",
							expireTime: Number(panel.vipInfo.e_time ?? 0),
						}
					: undefined,
				managerInfo: managerInfo.length > 0 ? managerInfo : undefined,
				gradeInfo: gradeInfo.length > 0 ? gradeInfo : undefined,
				isDefaultAvatar: user?.isDefaultAvatar,
				isBawu: user?.isBawu,
				isCoreuser: user?.isCoreuser,
				levelId: user?.levelId,
				likeForum: user?.likeForum?.length
					? user.likeForum.map((f) => ({
							name: f.forumName,
							id: f.forumId,
						}))
					: undefined,
				privacy,
				recentPosts: profile?.postList?.length
					? profile.postList.map((p) => ({
							threadId: p.threadId,
							title: p.title,
							forumName: p.forumName,
							createTime: p.createTime,
							replyNum: p.replyNum,
							agreeNum: Number(p.agree?.agreeNum ?? 0),
						}))
					: undefined,
			});
		},
	)
	.get(
		"/follow",
		describeRoute({
			tags: ["user"],
			summary: "获取关注列表",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", methodWithPage),
		async (c) => {
			const { method, id, page } = c.req.valid("query");
			const userId = await UserIdResolver.resolve(method, id, MethodEnum.id);
			const res = await Effect.runPromise(
				getFollow(userId, page === "ALL" ? "ALL" : Number(page)),
			);
			return c.json(res);
		},
	)
	.get(
		"/fan",
		describeRoute({
			tags: ["user"],
			summary: "获取粉丝列表",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", methodWithPage),
		async (c) => {
			const { method, id, page } = c.req.valid("query");
			const userId = await UserIdResolver.resolve(method, id, MethodEnum.id);
			const res = await Effect.runPromise(
				getFans(userId, page === "ALL" ? "ALL" : Number(page)),
			);
			return c.json(res);
		},
	);
