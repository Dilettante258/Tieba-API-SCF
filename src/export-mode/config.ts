/**
 * Export 配置负责把文件、URL、环境变量或 inline JSON 收敛成同一种运行语义。
 * databaseUrl/BDUSS 属于运行时 secret，只参与连接与鉴权，不参与 jobKey 计算。
 * 同一组待爬目标会稳定映射到同一个 jobKey，方便 Docker 重启后续跑。
 * `endTime: "now"` 表示每次启动补齐到当前时间，targetKey 保持稳定。
 * worker 配置只描述 lease、重试和空闲轮询策略，分布式互斥仍由 PostgreSQL 承担。
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { z } from "zod/v4";

const DEFAULT_REQUESTS_PER_MINUTE = 30;
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_FORUM_PAGES = 500;
const DEFAULT_MAX_THREAD_PAGES = 600;
const DEFAULT_ACTIVE_SUB_POST_PAGE_LIMIT = 20;
const DEFAULT_LEASE_SECONDS = 300;
const DEFAULT_CLAIM_BATCH_SIZE = 1;
const DEFAULT_MAX_TASK_ATTEMPTS = 5;
const DEFAULT_MAX_SCAN_ATTEMPTS = 5;
const DEFAULT_IDLE_POLL_MS = 5_000;
const DEFAULT_NOTIFY_PROGRESS_INTERVAL_MINUTES = 30;

export const exportTargetFileConfigSchema = z
	.object({
		forumName: z
			.string()
			.min(1)
			.optional()
			.describe("贴吧名；也兼容 fname/forum/name 这些别名。"),
		fname: z.string().min(1).optional().describe("forumName 的别名。"),
		forum: z.string().min(1).optional().describe("forumName 的别名。"),
		name: z.string().min(1).optional().describe("forumName 的别名。"),
		startTime: z
			.string()
			.min(1)
			.optional()
			.describe("抓取起始时间，支持 YYYY-MM-DD 或 ISO 时间。"),
		from: z.string().min(1).optional().describe("startTime 的别名。"),
		start: z.string().min(1).optional().describe("startTime 的别名。"),
		since: z.string().min(1).optional().describe("startTime 的别名。"),
		endTime: z
			.string()
			.min(1)
			.optional()
			.describe('抓取结束时间；"now" 表示每次启动补齐到当前时间。'),
		to: z.string().min(1).optional().describe("endTime 的别名。"),
		end: z.string().min(1).optional().describe("endTime 的别名。"),
		until: z.string().min(1).optional().describe("endTime 的别名。"),
		sort: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("贴吧列表排序；1 通常表示按发帖时间。"),
		pageSize: z
			.number()
			.int()
			.min(1)
			.max(100)
			.optional()
			.describe("列表页每页请求数量，tieba.js 会限制在 30~100。"),
		maxForumPages: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("最多扫描多少个贴吧列表页，并生成同等数量的 page tasks。"),
		maxThreadPages: z
			.number()
			.int()
			.min(1)
			.max(600)
			.optional()
			.describe("单个主题帖最多抓多少页回复。"),
		maxThreads: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("可选：限制该 target 最多发现多少个主题帖。"),
		includeComments: z
			.boolean()
			.optional()
			.describe("是否保存帖子接口随页返回的内嵌楼中楼。"),
		activeSubPostFetch: z
			.boolean()
			.optional()
			.describe("是否主动调用楼中楼接口深抓；默认建议关闭。"),
		activeSubPostPageLimit: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("主动深抓楼中楼时，每个 post 最多抓多少页。"),
	})
	.refine(
		(target) => target.forumName ?? target.fname ?? target.forum ?? target.name,
		"target requires forumName/fname/forum/name",
	)
	.refine(
		(target) => target.startTime ?? target.from ?? target.start ?? target.since,
		"target requires startTime/from/start/since",
	)
	.passthrough()
	.describe("单个贴吧导出目标的文件配置。");

export const exportCrawlFileConfigSchema = z
	.object({
		sort: z.number().int().positive().optional().describe("全局默认排序。"),
		pageSize: z
			.number()
			.int()
			.min(1)
			.max(100)
			.optional()
			.describe("全局默认列表页大小。"),
		maxForumPages: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("全局默认列表页扫描上限。"),
		maxThreadPages: z
			.number()
			.int()
			.min(1)
			.max(600)
			.optional()
			.describe("全局默认主题帖回复页扫描上限。"),
		includeComments: z
			.boolean()
			.optional()
			.describe("全局默认是否保存内嵌楼中楼。"),
		activeSubPostFetch: z
			.boolean()
			.optional()
			.describe("全局默认是否主动深抓楼中楼。"),
		activeSubPostPageLimit: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("全局默认主动深抓楼中楼页数上限。"),
	})
	.passthrough()
	.describe("抓取默认值；target 中同名字段会覆盖这里。");

export const exportRateFileConfigSchema = z
	.object({
		requestsPerMinute: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("每分钟允许启动多少个 Tieba API 请求。"),
		rpm: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("requestsPerMinute 的简写别名。"),
		minIntervalMs: z
			.number()
			.int()
			.min(0)
			.optional()
			.describe("请求启动间隔；设置后优先于 requestsPerMinute 推导值。"),
	})
	.passthrough()
	.describe("单容器内的 Tieba API 限速配置。");

export const exportWorkerFileConfigSchema = z
	.object({
		leaseSeconds: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("DB lease 秒数，容器崩溃后过期任务会被其他容器接管。"),
		claimBatchSize: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("每轮最多 claim 多少个 thread/page task。"),
		maxTaskAttempts: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("主题帖抓取任务最大尝试次数。"),
		maxScanAttempts: z
			.number()
			.int()
			.positive()
			.optional()
			.describe("列表页扫描任务最大尝试次数。"),
		idlePollMs: z
			.number()
			.int()
			.min(100)
			.optional()
			.describe("没有可领取任务时的轮询等待时间。"),
	})
	.passthrough()
	.describe("多容器 worker 调度参数。");

export const exportNotifyFileConfigSchema = z
	.object({
		recipients: z.array(z.string().email()).optional(),
		progressIntervalMinutes: z.number().int().positive().optional(),
		enabled: z.boolean().optional(),
	})
	.passthrough();

export const exportConfigFileSchema = z
	.object({
		name: z.string().min(1).optional().describe("导出任务展示名。"),
		jobKey: z
			.string()
			.min(1)
			.optional()
			.describe("可选：手动固定 jobKey；不写时会稳定生成。"),
		databaseUrl: z
			.string()
			.min(1)
			.optional()
			.describe("数据库连接 URL；可省略并使用 DATABASE_URL 环境变量。"),
		bduss: z
			.string()
			.min(1)
			.optional()
			.describe("百度 BDUSS；生产环境建议用 BDUSS 环境变量。"),
		targets: z
			.array(exportTargetFileConfigSchema)
			.optional()
			.describe("需要导出的贴吧与时间范围。"),
		rate: exportRateFileConfigSchema.optional(),
		crawl: exportCrawlFileConfigSchema.optional(),
		notify: exportNotifyFileConfigSchema.optional(),
		database: z
			.record(z.string(), z.unknown())
			.optional()
			.describe("数据库配置对象；当前支持 database.url。"),
		worker: exportWorkerFileConfigSchema.optional(),
	})
	.passthrough()
	.describe("导出模式 JSON 文件的输入配置。");

const rawConfigSchema = exportConfigFileSchema;

export const exportTargetConfigSchema = z
	.object({
		targetKey: z.string().min(1).describe("由 target 身份字段稳定生成的 key。"),
		forumName: z.string().min(1).describe("归一化后的贴吧名。"),
		startTime: z.date().describe("归一化后的抓取起始时间。"),
		endTime: z.date().describe("归一化后的抓取结束时间。"),
		sort: z.number().int().positive().describe("归一化后的列表排序。"),
		pageSize: z.number().int().min(1).max(100).describe("归一化后的列表页大小。"),
		maxForumPages: z
			.number()
			.int()
			.positive()
			.describe("归一化后的列表页扫描上限。"),
		maxThreadPages: z
			.number()
			.int()
			.min(1)
			.max(600)
			.describe("归一化后的主题帖回复页扫描上限。"),
		maxThreads: z.number().int().positive().optional().describe("主题帖数量上限。"),
		includeComments: z.boolean().describe("是否保存帖子接口返回的内嵌楼中楼。"),
		activeSubPostFetch: z.boolean().describe("是否主动深抓楼中楼。"),
		activeSubPostPageLimit: z
			.number()
			.int()
			.positive()
			.describe("主动深抓楼中楼页数上限。"),
	})
	.describe("运行时归一化后的单个贴吧目标。");

export const exportRateConfigSchema = z
	.object({
		requestsPerMinute: z.number().int().positive().describe("每分钟请求数。"),
		minIntervalMs: z.number().int().min(0).describe("请求启动最小间隔。"),
	})
	.describe("运行时归一化后的限速配置。");

export const exportWorkerConfigSchema = z
	.object({
		leaseSeconds: z.number().int().positive().describe("DB lease 秒数。"),
		claimBatchSize: z.number().int().positive().describe("每轮任务 claim 数。"),
		maxTaskAttempts: z.number().int().positive().describe("thread task 最大尝试次数。"),
		maxScanAttempts: z.number().int().positive().describe("page scan task 最大尝试次数。"),
		idlePollMs: z.number().int().min(100).describe("空闲轮询等待毫秒数。"),
	})
	.describe("运行时归一化后的 worker 配置。");

export const exportNotifyConfigSchema = z.object({
	recipients: z.array(z.string().email()),
	progressIntervalMinutes: z.number().int().positive(),
	enabled: z.boolean(),
});

export const exportConfigSchema = z
	.object({
		name: z.string().min(1).describe("导出任务展示名。"),
		jobKey: z.string().min(1).describe("跨重启复用同一任务的稳定 key。"),
		configHash: z.string().min(1).describe("完整运行配置 hash。"),
		databaseUrl: z.string().min(1).describe("数据库连接 URL。"),
		bduss: z.string().min(1).describe("Tieba 鉴权 BDUSS。"),
		targets: z.array(exportTargetConfigSchema).min(1).describe("归一化后的目标列表。"),
		rate: exportRateConfigSchema,
		worker: exportWorkerConfigSchema,
		notify: exportNotifyConfigSchema,
		raw: z.record(z.string(), z.unknown()).describe("原始输入配置，便于排查。"),
	})
	.describe("导出模式运行时配置。");

export type ExportTargetConfig = z.infer<typeof exportTargetConfigSchema>;
export type ExportRateConfig = z.infer<typeof exportRateConfigSchema>;
export type ExportWorkerConfig = z.infer<typeof exportWorkerConfigSchema>;
export type ExportNotifyConfig = z.infer<typeof exportNotifyConfigSchema>;
export type ExportConfig = z.infer<typeof exportConfigSchema>;
export type ExportConfigFile = z.infer<typeof exportConfigFileSchema>;

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

function readEmailList(value: unknown): string[] {
	if (!Array.isArray(value)) return [];

	const seen = new Set<string>();
	for (const item of value) {
		if (typeof item !== "string") continue;
		const email = item.trim();
		if (email) seen.add(email);
	}
	return Array.from(seen);
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

function canonicalize(value: unknown): unknown {
	if (value instanceof Date) return value.toISOString();
	if (Array.isArray(value)) return value.map(canonicalize);
	if (!isRecord(value)) return value;

	return Object.fromEntries(
		Object.entries(value)
			.filter(([, entry]) => entry !== undefined)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([key, entry]) => [key, canonicalize(entry)]),
	);
}

function hashValue(value: unknown): string {
	return createHash("sha256")
		.update(JSON.stringify(canonicalize(value)))
		.digest("hex");
}

function stableLiteral(value: unknown): unknown {
	const text = readString(value);
	if (text) return text.toLowerCase() === "now" ? "now" : text;
	if (value instanceof Date) return value.toISOString();
	return value ?? null;
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
	const pageSize = Math.min(
		100,
		readPositiveInteger(
			rawTarget.pageSize ?? crawl.pageSize,
			DEFAULT_PAGE_SIZE,
		),
	);
	const maxForumPages = readPositiveInteger(
		rawTarget.maxForumPages ?? crawl.maxForumPages,
		DEFAULT_MAX_FORUM_PAGES,
	);
	const maxThreadPages = Math.min(
		600,
		readPositiveInteger(
			rawTarget.maxThreadPages ?? crawl.maxThreadPages,
			DEFAULT_MAX_THREAD_PAGES,
		),
	);
	const maxThreads = readOptionalPositiveInteger(
		rawTarget.maxThreads ?? crawl.maxThreads,
	);
	const includeComments = readBoolean(
		rawTarget.includeComments ??
			rawTarget.withComments ??
			crawl.includeComments ??
			crawl.withComments,
		true,
	);
	const activeSubPostFetch = readBoolean(
		rawTarget.activeSubPostFetch ??
			rawTarget.fetchAllSubPosts ??
			rawTarget.fetchSubPosts ??
			rawTarget.includeSubPosts ??
			crawl.activeSubPostFetch ??
			crawl.fetchAllSubPosts ??
			crawl.fetchSubPosts ??
			crawl.includeSubPosts,
		false,
	);
	const activeSubPostPageLimit = readPositiveInteger(
		rawTarget.activeSubPostPageLimit ??
			rawTarget.maxSubPostPages ??
			rawTarget.subPostPageLimit ??
			crawl.activeSubPostPageLimit ??
			crawl.maxSubPostPages ??
			crawl.subPostPageLimit,
		DEFAULT_ACTIVE_SUB_POST_PAGE_LIMIT,
	);
	const identity = {
		forumName,
		startTime: stableLiteral(startValue),
		endTime: stableLiteral(endValue ?? "now"),
		sort,
		pageSize,
		maxForumPages,
		maxThreadPages,
		maxThreads,
		includeComments,
		activeSubPostFetch,
		activeSubPostPageLimit,
	};

	return exportTargetConfigSchema.parse({
		targetKey: `${forumName}:${hashValue(identity).slice(0, 16)}`,
		forumName,
		startTime: parseDate(startValue, false),
		endTime: parseDate(endValue ?? "now", true),
		sort,
		pageSize,
		maxForumPages,
		maxThreadPages,
		maxThreads,
		includeComments,
		activeSubPostFetch,
		activeSubPostPageLimit,
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
	const workerRaw = isRecord(raw.worker) ? raw.worker : {};
	const notifyRaw = isRecord(raw.notify) ? raw.notify : {};
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
	const worker = exportWorkerConfigSchema.parse({
		leaseSeconds: readPositiveInteger(
			workerRaw.leaseSeconds ?? process.env.EXPORT_LEASE_SECONDS,
			DEFAULT_LEASE_SECONDS,
		),
		claimBatchSize: readPositiveInteger(
			workerRaw.claimBatchSize ?? process.env.EXPORT_CLAIM_BATCH_SIZE,
			DEFAULT_CLAIM_BATCH_SIZE,
		),
		maxTaskAttempts: readPositiveInteger(
			workerRaw.maxTaskAttempts ?? process.env.EXPORT_MAX_TASK_ATTEMPTS,
			DEFAULT_MAX_TASK_ATTEMPTS,
		),
		maxScanAttempts: readPositiveInteger(
			workerRaw.maxScanAttempts ?? process.env.EXPORT_MAX_SCAN_ATTEMPTS,
			DEFAULT_MAX_SCAN_ATTEMPTS,
		),
		idlePollMs: Math.max(
			100,
			Math.floor(
				readNumber(
					workerRaw.idlePollMs ?? process.env.EXPORT_IDLE_POLL_MS,
					DEFAULT_IDLE_POLL_MS,
				),
			),
		),
	});
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

	const name =
		readString(raw.name, process.env.EXPORT_JOB_NAME) ?? "tieba-export";
	const notifyRecipients = readEmailList(notifyRaw.recipients);
	const notify = exportNotifyConfigSchema.parse({
		recipients: notifyRecipients,
		progressIntervalMinutes: readPositiveInteger(
			notifyRaw.progressIntervalMinutes,
			DEFAULT_NOTIFY_PROGRESS_INTERVAL_MINUTES,
		),
		enabled:
			notifyRecipients.length > 0
				? readBoolean(notifyRaw.enabled, true)
				: readBoolean(notifyRaw.enabled, false),
	});
	const targets = rawTargets.map((target) => {
		if (!isRecord(target)) {
			throw new Error("Export targets must be objects");
		}
		return parseTarget(target, raw);
	});
	const rateConfig = { requestsPerMinute, minIntervalMs };
	const schedulingHash = hashValue({
		name,
		targets: targets.map((target) => target.targetKey),
	});
	const configHash = hashValue({
		name,
		rate: rateConfig,
		worker,
		targets: targets.map((target) => ({
			targetKey: target.targetKey,
			forumName: target.forumName,
			startTime: target.startTime.toISOString(),
			endTime: target.endTime.toISOString(),
			sort: target.sort,
			pageSize: target.pageSize,
			maxForumPages: target.maxForumPages,
			maxThreadPages: target.maxThreadPages,
			maxThreads: target.maxThreads,
			includeComments: target.includeComments,
			activeSubPostFetch: target.activeSubPostFetch,
			activeSubPostPageLimit: target.activeSubPostPageLimit,
		})),
	});
	const jobKey =
		readString(raw.jobKey, process.env.EXPORT_JOB_KEY) ??
		`${name}:${schedulingHash.slice(0, 16)}`;

	return exportConfigSchema.parse({
		name,
		jobKey,
		configHash,
		databaseUrl,
		bduss,
		targets,
		rate: rateConfig,
		worker,
		notify,
		raw,
	});
}
