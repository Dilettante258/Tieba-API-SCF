import { getThreads } from "@tieba/sdk";
import { Effect } from "effect";

export type ThreadsResult = Effect.Effect.Success<ReturnType<typeof getThreads>>;
export type ForumThreadInfo = NonNullable<ThreadsResult>["threadList"][number];

const DEFAULT_PAGE_SIZE = 30;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_MAX_PAGES = 40;
const FIRST_PAGE_THREAD_ESTIMATE = 13;
const NEXT_PAGE_THREAD_ESTIMATE = 29;

interface FetchForumThreadsOptions {
	fname: string;
	sort: number;
	targetCount: number;
	pageSize?: number;
	concurrency?: number;
	maxPages?: number;
}

/**
 * 按估算页数并发抓取贴吧主题帖，再截取目标数量。
 * 估算依据：首屏通常明显偏少（约 13），后续页接近 29~30。
 */
export async function fetchForumThreadsEnough({
	fname,
	sort,
	targetCount,
	pageSize = DEFAULT_PAGE_SIZE,
	concurrency = DEFAULT_BATCH_SIZE,
	maxPages = DEFAULT_MAX_PAGES,
}: FetchForumThreadsOptions): Promise<ForumThreadInfo[]> {
	const wanted = Math.max(1, targetCount);
	const remainingAfterFirst = Math.max(0, wanted - FIRST_PAGE_THREAD_ESTIMATE);
	const estimatedPages =
		1 + Math.ceil(remainingAfterFirst / NEXT_PAGE_THREAD_ESTIMATE);
	const pages = Math.min(Math.max(estimatedPages, 1), maxPages);

	const pageEffects = Array.from({ length: pages }, (_, i) =>
		getThreads({
			fname,
			page: i + 1,
			sort,
			rn: pageSize,
		}),
	);
	const pageResults = await Effect.runPromise(
		Effect.all(pageEffects, { concurrency: Math.min(concurrency, pages) }),
	);

	const threads = pageResults
		.flatMap((result) => result?.threadList ?? [])
		.filter((t) => !t.isTop);

	// 第一批估算抓取后，若仍不足则仅补抓 1 页
	if (threads.length < wanted && pages < maxPages) {
		const extraPageResult = await Effect.runPromise(
			getThreads({
				fname,
				page: pages + 1,
				sort,
				rn: pageSize,
			}),
		);
		threads.push(
			...(extraPageResult?.threadList ?? []).filter((t) => !t.isTop),
		);
	}

	return threads.slice(0, wanted);
}
