import { Scalar } from "@scalar/hono-api-reference";
import { describeRoute, openAPIRouteHandler } from "hono-openapi";
import { Hono, type Context } from "hono";
import { cache } from "hono/cache";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { exportRoute } from "./routes/export.ts";
import { forumAnalyzeRoute } from "./routes/forum-analyze.ts";
import { forumSearchRoute } from "./routes/forum-search.ts";
import { forumRoute } from "./routes/forum.ts";
import { postRoute } from "./routes/post.ts";
import { userRoute } from "./routes/user.ts";
import { handleError } from "./utils/error.ts";

const APP_VERSION = "3.0.0";

type RuntimeKind = "bun" | "node" | "worker" | "unknown";
type CacheRuntimeMode = "auto" | "worker" | "server";

interface CreateAppOptions {
	cacheRuntime?: CacheRuntimeMode;
}

function compactRecord<T extends Record<string, unknown>>(input: T): T {
	return Object.fromEntries(
		Object.entries(input).filter(([, value]) => value !== undefined),
	) as T;
}

function readCfValue(
	obj: Record<string, unknown>,
	key: string,
): string | undefined {
	const value = obj[key];
	return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readCfNumber(
	obj: Record<string, unknown>,
	key: string,
): number | undefined {
	const value = obj[key];
	return typeof value === "number" && Number.isFinite(value)
		? value
		: undefined;
}

function getRuntimeKind(cf: Record<string, unknown> | undefined): RuntimeKind {
	if (cf) return "worker";
	if (typeof (globalThis as { Bun?: unknown; }).Bun !== "undefined")
		return "bun";
	if (typeof process !== "undefined" && !!process.versions?.node) return "node";
	return "unknown";
}

function getMemoryInfo() {
	if (
		typeof process === "undefined" ||
		typeof process.memoryUsage !== "function"
	) {
		return undefined;
	}
	const m = process.memoryUsage();
	return {
		rss: m.rss,
		heapTotal: m.heapTotal,
		heapUsed: m.heapUsed,
		external: m.external,
		arrayBuffers: m.arrayBuffers,
	};
}

function buildHealthData(c: Context) {
	const rawReq = c.req.raw as Request & { cf?: Record<string, unknown>; };
	const cf = rawReq.cf && typeof rawReq.cf === "object" ? rawReq.cf : undefined;
	const runtimeKind = getRuntimeKind(cf);
	const bunRuntime = (globalThis as { Bun?: { version?: string; }; }).Bun;

	const runtime = compactRecord({
		kind: runtimeKind,
		nodeVersion:
			typeof process !== "undefined" ? process.versions?.node : undefined,
		bunVersion: bunRuntime?.version,
		platform: typeof process !== "undefined" ? process.platform : undefined,
		arch: typeof process !== "undefined" ? process.arch : undefined,
		pid: typeof process !== "undefined" ? process.pid : undefined,
		uptimeSec:
			typeof process !== "undefined" && typeof process.uptime === "function"
				? Number(process.uptime().toFixed(3))
				: undefined,
	});

	const cfInfo = cf
		? compactRecord({
			colo: readCfValue(cf, "colo"),
			country: readCfValue(cf, "country"),
			region: readCfValue(cf, "region"),
			city: readCfValue(cf, "city"),
			timezone: readCfValue(cf, "timezone"),
			asn: readCfNumber(cf, "asn"),
			asOrganization: readCfValue(cf, "asOrganization"),
		})
		: undefined;

	return compactRecord({
		status: "ok",
		version: APP_VERSION,
		timestamp: new Date().toISOString(),
		runtime,
		system: compactRecord({
			hostname:
				typeof process !== "undefined" ? process.env.HOSTNAME : undefined,
			memory: getMemoryInfo(),
			worker: cfInfo,
		}),
	});
}

function isCfWorkerRequest(c: Context): boolean {
	const rawReq = c.req.raw as Request & { cf?: unknown; };
	return !!(rawReq.cf && typeof rawReq.cf === "object");
}

function shouldUseWorkerCache(c: Context, mode: CacheRuntimeMode): boolean {
	if (mode === "worker") return true;
	if (mode === "server") return false;
	return isCfWorkerRequest(c);
}

/** 根据路径返回 Cache-Control max-age（秒） */
function getCacheMaxAge(path: string): number {
	if (path.startsWith("/forum/thread")) return 60; // 帖子列表变化频繁
	if (path.includes("/posts")) return 120; // 用户发帖记录
	if (path.startsWith("/openapi.json")) return 3600; // 文档文件可长缓存
	if (path.startsWith("/docs")) return 300; // 文档页面适中缓存
	return 300; // 默认 5 分钟
}

function applyCacheControlHeader(c: Context): void {
	const maxAge = getCacheMaxAge(c.req.path);
	const cacheControl = `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`;
	c.header("Cache-Control", cacheControl);
}

export function createApp(options: CreateAppOptions = {}) {
	const app = new Hono();
	const cacheRuntime = options.cacheRuntime ?? "auto";
	const workerCacheMiddleware = cache({
		cacheName: "tieba-api-scf",
	});

	app.use("*", logger());
	app.use(
		"*",
		cors({
			origin: [
				"http://localhost:3000",
				"http://localhost:5173",
				"http://localhost:8000",
				"https://tb.wang1m.tech",
				"https://www.eztb.org",
				"https://cf.eztb.org",
				"https://phetvhjuuxvw.cloud.sealos.io",
			],
			allowMethods: ["GET", "POST", "OPTIONS"],
			maxAge: 600,
			credentials: true,
		}),
	);
	app.get("*", async (c, next) => {
		if (shouldUseWorkerCache(c, cacheRuntime)) {
			const response = await workerCacheMiddleware(c, async () => {
				await next();
				applyCacheControlHeader(c);
			});
			if (response) return response;
			return;
		}

		await next();
		applyCacheControlHeader(c);
	});
	app.route("/user", userRoute);
	app.route("/post", postRoute);
	app.route("/export", exportRoute);
	app.route("/forum", forumRoute);
	app.route("/forum", forumAnalyzeRoute);
	app.route("/forum", forumSearchRoute);
	app
		.all('/', (c) => c.redirect('/docs', 301))
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
							url: "https://cf.eztb.org",
							description: "Cloudflare Worker",
						},
						{
							url: "https://phetvhjuuxvw.cloud.sealos.io",
							description: "Sealos 部署（生产）",
						},
						{
							url: "http://localhost:8000",
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
		)
		.get(
			"/health",
			describeRoute({
				summary: "服务健康检查",
				description: "返回服务状态、运行时类型（bun/node/worker）及系统信息。",
				tags: ["system"],
				responses: {
					200: {
						description: "服务运行状态",
					},
				},
			}),
			(c) => c.json(buildHealthData(c), 200),
		);

	app.onError(handleError);

	return app;
}
