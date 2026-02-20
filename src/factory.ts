import { cache } from "hono/cache";
import type { BlankEnv, MiddlewareHandler } from "hono/types";

/** 根据路径返回 Cache-Control max-age（秒） */
function getCacheMaxAge(path: string): number {
	if (path.startsWith("/forum/thread")) return 60; // 帖子列表变化频繁
	if (path.includes("/posts")) return 120; // 用户发帖记录
	if (path.startsWith("/openapi.json")) return 3600; // 文档文件可长缓存
	if (path.startsWith("/docs")) return 300; // 文档页面适中缓存
	return 300; // 默认 5 分钟
}

export const normalCacheMiddleware: MiddlewareHandler<BlankEnv, "*"> = async (
	c,
	next,
) => {
	await next();
	const maxAge = getCacheMaxAge(c.req.path);
	const cacheControl = `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`;
	c.res.headers.set("Cache-Control", cacheControl);
};

export const cfCacheMiddleware: MiddlewareHandler<BlankEnv, "*"> = async (
	c,
	next,
) => {
	await next();
	const maxAge = getCacheMaxAge(c.req.path);
	const cacheControl = `public, max-age=${maxAge}, stale-while-revalidate=${maxAge * 2}`;
	cache({
		cacheName: "tieba-api-scf",
		cacheControl,
		cacheableStatusCodes: [200, 412, 404],
	});
};
