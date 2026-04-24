import { readFile } from "node:fs/promises";
import { z } from "zod/v4";

const DEFAULT_REQUESTS_PER_MINUTE = 30;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_FORUM_PAGES = 500;
const DEFAULT_MAX_THREAD_PAGES = 600;
const DEFAULT_SUB_POST_PAGE_LIMIT = 20;

const rawConfigSchema = z
	.object({
		name: z.string().optional(),
		databaseUrl: z.string().optional(),
		bduss: z.string().optional(),
		targets: z.array(z.record(z.string(), z.unknown())).optional(),
		rate: z.record(z.string(), z.unknown()).optional(),
		crawl: z.record(z.string(), z.unknown()).optional(),
		database: z.record(z.string(), z.unknown()).optional(),
	})
	.passthrough();

export const exportTargetConfigSchema = z.object({
	forumName: z.string().min(1),
	startTime: z.date(),
	endTime: z.date(),
	sort: z.number().int().positive(),
	pageSize: z.number().int().min(1).max(100),
	maxForumPages: z.number().int().positive(),
	maxThreadPages: z.number().int().min(1).max(600),
	maxThreads: z.number().int().positive().optional(),
	includeComments: z.boolean(),
	includeSubPosts: z.boolean(),
	subPostPageLimit: z.number().int().positive(),
});

export const exportRateConfigSchema = z.object({
	requestsPerMinute: z.number().int().positive(),
	minIntervalMs: z.number().int().min(0),
});

export const exportConfigSchema = z.object({
	name: z.string().min(1),
	databaseUrl: z.string().min(1),
	bduss: z.string().min(1),
	targets: z.array(exportTargetConfigSchema).min(1),
	rate: exportRateConfigSchema,
	raw: z.record(z.string(), z.unknown()),
});

export type ExportTargetConfig = z.infer<typeof exportTargetConfigSchema>;
export type ExportRateConfig = z.infer<typeof exportRateConfigSchema>;
export type ExportConfig = z.infer<typeof exportConfigSchema>;

function isRecord(value: unknown): value is Record<string, unknown> {
	return !!value && typeof value === "object" && !Array.isArray(value);
}

function readString(...values: unknown[]): string | undefined {
	for (const value of values) {
		if (typeof value === "string" && value.trim()) return value.trim();
	}
	return undefined;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") return value;
	if (typeof value === "string") {
		if (["true", "1", "yes", "y"].includes(value.toLowerCase())) return true;
		if (["false", "0", "no", "n"].includes(value.toLowerCase())) return false;
	}
	return fallback;
}

function readNumber(value: unknown, fallback: number): number {
	const num =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: Number.NaN;
	return Number.isFinite(num) ? num : fallback;
}

function readPositiveInteger(value: unknown, fallback: number): number {
	return Math.max(1, Math.floor(readNumber(value, fallback)));
}

function readOptionalPositiveInteger(value: unknown): number | undefined {
	if (value === undefined || value === null || value === "") return undefined;
	return readPositiveInteger(value, 1);
}

function parseDate(value: unknown, endOfDay: boolean): Date {
	const text = readString(value);
	if (!text || text.toLowerCase() === "now") return new Date();
	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		return new Date(
			`${text}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`,
		);
	}

	const date = new Date(text);
	if (Number.isNaN(date.getTime())) {
		throw new Error(`Invalid export date: ${text}`);
	}
	return date;
}

function parseTarget(
	rawTarget: Record<string, unknown>,
	rawConfig: Record<string, unknown>,
): ExportTargetConfig {
	const crawl = isRecord(rawConfig.crawl) ? rawConfig.crawl : {};
	const forumName = readString(
		rawTarget.forumName,
		rawTarget.fname,
		rawTarget.forum,
		rawTarget.name,
	);
	if (!forumName) {
		throw new Error("Each export target requires forumName/fname/forum");
	}

	const startValue =
		rawTarget.startTime ?? rawTarget.from ?? rawTarget.start ?? rawTarget.since;
	if (!startValue) {
		throw new Error(`Export target ${forumName} requires startTime/from`);
	}

	const endValue =
		rawTarget.endTime ?? rawTarget.to ?? rawTarget.end ?? rawTarget.until;
	const sort = readPositiveInteger(rawTarget.sort ?? crawl.sort, 1);

	return exportTargetConfigSchema.parse({
		forumName,
		startTime: parseDate(startValue, false),
		endTime: parseDate(endValue ?? "now", true),
		sort,
		pageSize: Math.min(
			100,
			readPositiveInteger(
				rawTarget.pageSize ?? crawl.pageSize,
				DEFAULT_PAGE_SIZE,
			),
		),
		maxForumPages: readPositiveInteger(
			rawTarget.maxForumPages ?? crawl.maxForumPages,
			DEFAULT_MAX_FORUM_PAGES,
		),
		maxThreadPages: Math.min(
			600,
			readPositiveInteger(
				rawTarget.maxThreadPages ?? crawl.maxThreadPages,
				DEFAULT_MAX_THREAD_PAGES,
			),
		),
		maxThreads: readOptionalPositiveInteger(
			rawTarget.maxThreads ?? crawl.maxThreads,
		),
		includeComments: readBoolean(
			rawTarget.includeComments ?? crawl.includeComments,
			false,
		),
		includeSubPosts: readBoolean(
			rawTarget.includeSubPosts ?? crawl.includeSubPosts,
			false,
		),
		subPostPageLimit: readPositiveInteger(
			rawTarget.subPostPageLimit ?? crawl.subPostPageLimit,
			DEFAULT_SUB_POST_PAGE_LIMIT,
		),
	});
}

async function readJsonFromUrl(url: string): Promise<Record<string, unknown>> {
	const res = await fetch(url);
	if (!res.ok) {
		throw new Error(
			`Failed to fetch export config: ${res.status} ${res.statusText}`,
		);
	}
	return JSON.parse(await res.text()) as Record<string, unknown>;
}

async function readJsonFromFile(
	path: string,
): Promise<Record<string, unknown>> {
	return JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
}

async function readRawConfig(): Promise<Record<string, unknown>> {
	const inline = process.env.EXPORT_CONFIG;
	if (inline) return JSON.parse(inline) as Record<string, unknown>;

	const inlineBase64 = process.env.EXPORT_CONFIG_BASE64;
	if (inlineBase64) {
		return JSON.parse(
			Buffer.from(inlineBase64, "base64").toString("utf8"),
		) as Record<string, unknown>;
	}

	const url = process.env.EXPORT_CONFIG_URL;
	if (url) return readJsonFromUrl(url);

	const file = process.env.EXPORT_CONFIG_FILE ?? process.env.EXPORT_CONFIG_PATH;
	if (file) return readJsonFromFile(file);

	return {};
}

export async function loadExportConfig(): Promise<ExportConfig> {
	const raw = rawConfigSchema.parse(await readRawConfig());
	const rate = isRecord(raw.rate) ? raw.rate : {};
	const targetsFromEnv = process.env.EXPORT_TARGETS
		? (JSON.parse(process.env.EXPORT_TARGETS) as unknown)
		: undefined;
	const rawTargets = Array.isArray(raw.targets)
		? raw.targets
		: Array.isArray(targetsFromEnv)
			? targetsFromEnv
			: [];

	if (rawTargets.length === 0) {
		throw new Error(
			"Export config requires at least one target in targets or EXPORT_TARGETS",
		);
	}

	const requestsPerMinute = readPositiveInteger(
		rate.requestsPerMinute ??
			rate.rpm ??
			process.env.EXPORT_REQUESTS_PER_MINUTE,
		DEFAULT_REQUESTS_PER_MINUTE,
	);
	const minIntervalMs = Math.max(
		0,
		Math.floor(
			readNumber(
				rate.minIntervalMs,
				Math.ceil(60_000 / Math.max(1, requestsPerMinute)),
			),
		),
	);
	const databaseUrl = readString(
		raw.databaseUrl,
		isRecord(raw.database) ? raw.database.url : undefined,
		process.env.DATABASE_URL,
	);
	const bduss = readString(
		raw.bduss,
		isRecord(raw.auth) ? raw.auth.bduss : undefined,
		process.env.BDUSS,
	);

	if (!databaseUrl) throw new Error("databaseUrl or DATABASE_URL is required");
	if (!bduss) throw new Error("bduss or BDUSS is required");

	return exportConfigSchema.parse({
		name: readString(raw.name, process.env.EXPORT_JOB_NAME) ?? "tieba-export",
		databaseUrl,
		bduss,
		targets: rawTargets.map((target) => {
			if (!isRecord(target)) {
				throw new Error("Export targets must be objects");
			}
			return parseTarget(target, raw);
		}),
		rate: { requestsPerMinute, minIntervalMs },
		raw,
	});
}
