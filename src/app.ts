import { Scalar } from "@scalar/hono-api-reference";
import { openAPIRouteHandler } from "hono-openapi";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { dbAnalyzeRoute } from "./routes/db-analyze.ts";
import { exportRoute } from "./routes/export.ts";
import { forumAnalyzeRoute } from "./routes/forum-analyze.ts";
import { forumSearchRoute } from "./routes/forum-search.ts";
import { forumRoute } from "./routes/forum.ts";
import { postRoute } from "./routes/post.ts";
import { userRoute } from "./routes/user.ts";
import { handleError } from "./utils/error.ts";
import { cfCacheMiddleware, normalCacheMiddleware } from "./factory.ts";
import { APP_VERSION, domestic, foreign, local } from "./const.ts";
import { healthRoute } from "./routes/health.ts";

type CacheRuntimeMode = "worker" | "server";

interface CreateAppOptions {
	cacheRuntime?: CacheRuntimeMode;
}

export function createApp(options: CreateAppOptions = {}) {
	const app = new Hono()
		.onError(handleError)
		.use("*", logger())
		.use(
			"*",
			cors({
				origin: [
					"http://localhost:5173",
					"https://www.eztb.org",
					local,
					foreign,
					domestic,
				],
				allowMethods: ["GET", "POST", "OPTIONS", "DELETE"],
				maxAge: 7200,
				credentials: true,
			}),
		)
		.route("/user", userRoute)
		.route("/post", postRoute)
		.route("/export", exportRoute)
		.route("/forum", forumRoute)
		.route("/forum", forumAnalyzeRoute)
		.route("/forum", forumSearchRoute)
		.route("/health", healthRoute)
		.route("/db-analyze", dbAnalyzeRoute);
	app
		.all("/", (c) => c.redirect("/docs", 301))
		.get(
			"/openapi.json",
			openAPIRouteHandler(app, {
				documentation: {
					info: {
						title: "Tieba API",
						version: APP_VERSION,
						description: "基于 tieba.js 的贴吧数据接口服务。",
					},
					servers: [
						{
							url: foreign,
							description: "Cloudflare Worker",
						},
						{
							url: domestic,
							description: "Sealos 部署（生产）",
						},
						{
							url: local,
							description: "本地开发",
						},
					],
					tags: [
						{ name: "system", description: "系统状态与基础信息" },
						{ name: "user", description: "用户相关接口" },
						{ name: "post", description: "帖子相关接口" },
						{ name: "forum", description: "吧务与分析接口" },
						{ name: "export", description: "导出相关接口" },
					],
				},
				includeEmptyPaths: true,
				exclude: ["/openapi.json", "/docs"],
			}),
		)
		.get(
			"/docs",
			Scalar({
				title: "Tieba API 文档",
				pageTitle: "Tieba API Docs",
				url: "/openapi.json",
				theme: "deepSpace",
			}),
		);

	if (options.cacheRuntime === "worker") {
		app.use("*", normalCacheMiddleware);
	} else {
		app.use("*", cfCacheMiddleware);
	}

	return app;
}
