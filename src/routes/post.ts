import { zValidator } from "@hono/zod-validator";
import { getPosts } from "@tieba/sdk";
import { Effect } from "effect";
import { Hono } from "hono";
import { z } from "zod";

const tidQuery = z.object({
	tid: z.string(),
	page: z.string().optional().default("1"),
});

export const postRoute = new Hono()
	.get("/raw", zValidator("query", tidQuery), async (c) => {
		const { tid, page } = c.req.valid("query");
		const data = await Effect.runPromise(
			getPosts(Number(tid), page === "ALL" ? "ALL" : Number(page), {
				withComment: true,
			}),
		);
		return c.json(data);
	})
	.get("/pretty", zValidator("query", tidQuery), async (c) => {
		const { tid, page } = c.req.valid("query");
		const data = await Effect.runPromise(
			getPosts(Number(tid), page === "ALL" ? "ALL" : Number(page), {
				withComment: true,
			}),
		);
		// TODO: Apply collatePost processing when helpers are integrated
		return c.json(data);
	});
