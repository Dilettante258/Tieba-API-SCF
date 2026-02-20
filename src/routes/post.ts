import { describeRoute, validator as zValidator } from "hono-openapi";
import { getPosts } from "tieba.js";
import { Effect } from "effect";
import { Hono } from "hono";
import { z } from "zod/v4";

const tidQuery = z
	.object({
		tid: z.string().describe("主题帖 tid（帖子 ID）"),
		page: z
			.string()
			.optional()
			.default("1")
			.describe("页码；可传 ALL 表示抓取全部页"),
	})
	.describe("主题帖查询参数");

export const postRoute = new Hono()
	.get(
		"/raw",
		describeRoute({
			tags: ["post"],
			summary: "获取原始帖子内容",
			description: "返回主题帖及楼层数据（包含评论）。",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", tidQuery),
		async (c) => {
			const { tid, page } = c.req.valid("query");
			const data = await Effect.runPromise(
				getPosts(Number(tid), page === "ALL" ? "ALL" : Number(page), {
					withComment: true,
				}),
			);
			return c.json(data);
		},
	)
	.get(
		"/pretty",
		describeRoute({
			tags: ["post"],
			summary: "获取整理后帖子内容",
			description: "当前与 raw 返回一致，后续可扩展结构化处理。",
			responses: {
				200: {
					description: "查询成功",
				},
			},
		}),
		zValidator("query", tidQuery),
		async (c) => {
			const { tid, page } = c.req.valid("query");
			const data = await Effect.runPromise(
				getPosts(Number(tid), page === "ALL" ? "ALL" : Number(page), {
					withComment: true,
				}),
			);
			// TODO: Apply collatePost processing when helpers are integrated
			return c.json(data);
		},
	);
