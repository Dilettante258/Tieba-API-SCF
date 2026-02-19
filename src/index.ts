import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { forumAnalyzeRoute } from "./routes/forum-analyze.ts";
import { forumSearchRoute } from "./routes/forum-search.ts";
import { forumRoute } from "./routes/forum.ts";
import { postRoute } from "./routes/post.ts";
import { exportRoute } from "./routes/export.ts";
import { userRoute } from "./routes/user.ts";
import { handleError } from "./utils/error.ts";

import dotenv from "dotenv";
import { resolve } from "node:path";
import { setupClient } from "./lib/sdk.ts";
if (!process.env.production) {
	dotenv.config({ path: resolve(import.meta.dirname, "../../../.env") });
}
setupClient();

/** 根据路径返回 Cache-Control max-age（秒） */
function getCacheMaxAge(path: string): number {
	if (path.startsWith("/forum/thread")) return 60; // 帖子列表变化频繁
	if (path.includes("/posts")) return 120; // 用户发帖记录
	return 300; // 默认 5 分钟
}

const app = new Hono()
	.use(
		"*",
		cors({
			origin: [
				"http://localhost:3000",
				"http://localhost:5173",
				"https://tb.wang1m.tech",
				"https://www.eztb.org",
			],
			allowMethods: ["GET", "POST", "OPTIONS"],
			maxAge: 600,
			credentials: true,
		}),
	)
	.get("*", async (c, next) => {
		await next();
		const maxAge = getCacheMaxAge(c.req.path);
		const cacheControl = `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`;
		c.header(
			"Cache-Control",
			cacheControl,
		);
	})
	.route("/user", userRoute)
	.route("/post", postRoute)
	.route("/export", exportRoute)
	.route("/forum", forumRoute)
	.route("/forum", forumAnalyzeRoute)
	.route("/forum", forumSearchRoute);

app.onError(handleError);

app.get("/", (c) => c.json({ status: "ok", version: "2.0.0" }));

export type AppType = typeof app;

const port = Number(process.env.PORT) || 8000;
console.log(`Server is running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
