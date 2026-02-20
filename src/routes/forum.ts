import { describeRoute, validator as zValidator } from "hono-openapi";
import { getForumMembers, getThreads } from "tieba.js";
import { Effect } from "effect";
import { Hono } from "hono";
import { z } from "zod/v4";

const fnameQuery = z
	.object({
		fname: z.string().describe("贴吧名称，例如：v吧"),
		page: z.string().optional().default("1").describe("页码，从 1 开始"),
	})
	.describe("贴吧基础查询参数");

const threadQuery = fnameQuery
	.extend({
		sort: z
			.string()
			.optional()
			.default("1")
			.describe("排序方式：1=最新回复，0=最新发帖"),
		onlyGood: z
			.string()
			.optional()
			.default("false")
			.describe("是否仅看精品：true/false"),
		rn: z.string().optional().default("15").describe("每页返回条数，建议 1~30"),
	})
	.describe("贴吧主题列表查询参数");

export const forumRoute = new Hono()
	.get(
		"/member",
		describeRoute({
			tags: ["forum"],
			summary: "获取吧成员列表",
			description: "按页获取指定贴吧的成员信息。",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", fnameQuery),
		async (c) => {
			const { fname, page } = c.req.valid("query");
			const data = await Effect.runPromise(
				getForumMembers(fname, Number(page)),
			);
			return c.json(data);
		},
	)
	.get(
		"/thread",
		describeRoute({
			tags: ["forum"],
			summary: "获取帖子列表",
			description: "按排序和页码获取指定贴吧主题列表。",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", threadQuery),
		async (c) => {
			const { fname, page, sort, onlyGood, rn } = c.req.valid("query");
			const data = await Effect.runPromise(
				getThreads({
					fname,
					page: Number(page),
					rn: Number(rn) || 15,
					sort: Number(sort) || 1,
					onlyGood: onlyGood === "true",
				}),
			);
			return c.json(data);
		},
	);
