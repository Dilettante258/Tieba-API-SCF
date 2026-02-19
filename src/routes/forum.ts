import { zValidator } from "@hono/zod-validator";
import { getForumMembers, getThreads } from "tieba.js";
import { Effect } from "effect";
import { Hono } from "hono";
import { z } from "zod";

const fnameQuery = z.object({
	fname: z.string(),
	page: z.string().optional().default("1"),
});

const threadQuery = fnameQuery.extend({
	sort: z.string().optional().default("1"),
	onlyGood: z.string().optional().default("false"),
	rn: z.string().optional().default("15"),
});

export const forumRoute = new Hono()
	.get("/member", zValidator("query", fnameQuery), async (c) => {
		const { fname, page } = c.req.valid("query");
		const data = await Effect.runPromise(
			getForumMembers(fname, Number(page)),
		);
		return c.json(data);
	})
	.get("/thread", zValidator("query", threadQuery), async (c) => {
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
	});
