import { Hono } from "hono";
import { describeRoute } from "hono-openapi";
import { APP_VERSION } from "../const";

type RuntimeKind = "bun" | "node" | "worker" | "unknown";

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
	if (typeof (globalThis as { Bun?: unknown }).Bun !== "undefined")
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

export const healthRoute = new Hono().get(
	"/",
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
	(c) => {
		const rawReq = c.req.raw as Request & { cf?: Record<string, unknown> };
		const cf =
			rawReq.cf && typeof rawReq.cf === "object" ? rawReq.cf : undefined;
		const runtimeKind = getRuntimeKind(cf);
		const bunRuntime = (globalThis as { Bun?: { version?: string } }).Bun;

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

		const info = compactRecord({
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

		return c.json(info, 200);
	},
);
