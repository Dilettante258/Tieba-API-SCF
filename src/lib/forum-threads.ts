import { Effect } from "effect";
import { getThreads } from "tieba.js";
import { type RateLimiter, runLimited } from "./rate-limit.ts";

export type ThreadsResult = Effect.Effect.Success<
	ReturnType<typeof getThreads>
>;
export type ForumThreadPage = NonNullable<ThreadsResult>;
export type ForumThreadInfo = ForumThreadPage["threadList"][number];

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
	limiter?: RateLimiter;
}

export interface FetchForumThreadPageOptions {
	fname: string;
	sort: number;
	page: number;
	pageSize?: number;
	limiter?: RateLimiter;
}

export interface ForumThreadPageSnapshot {
	data: ThreadsResult;
	forum: ForumThreadPage["forum"] | undefined;
	userList: ForumThreadPage["userList"];
	threadList: ForumThreadInfo[];
	timelineThreads: ForumThreadInfo[];
	pageInfo: ForumThreadPage["page"] | undefined;
	hasMore: boolean;
}

export function filterTimelineThreads(
	threads: ForumThreadInfo[],
): ForumThreadInfo[] {
	return threads.filter((thread) => !thread.isTop);
}

export function estimateForumThreadPages(
	targetCount: number,
	maxPages = DEFAULT_MAX_PAGES,
): number {
	const wanted = Math.max(1, targetCount);
	const remainingAfterFirst = Math.max(0, wanted - FIRST_PAGE_THREAD_ESTIMATE);
	const estimatedPages =
		1 + Math.ceil(remainingAfterFirst / NEXT_PAGE_THREAD_ESTIMATE);
	return Math.min(Math.max(estimatedPages, 1), maxPages);
}

export function normalizeForumThreadPage(
	data: ThreadsResult,
): ForumThreadPageSnapshot {
	const threadList = data?.threadList ?? [];
	return {
		data,
		forum: data?.forum,
		userList: data?.userList ?? [],
		threadList,
		timelineThreads: filterTimelineThreads(threadList),
		pageInfo: data?.page,
		hasMore: data?.page ? data.page.hasMore !== 0 : threadList.length > 0,
	};
}

async function mapWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	mapper: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
	const results = new Array<R>(items.length);
	let nextIndex = 0;

	async function worker(): Promise<void> {
		while (nextIndex < items.length) {
			const index = nextIndex;
			nextIndex += 1;
			results[index] = await mapper(items[index], index);
		}
	}

	await Promise.all(
		Array.from(
			{ length: Math.min(Math.max(1, concurrency), items.length) },
			() => worker(),
		),
	);
	return results;
}

export async function fetchForumThreadPage({
	fname,
	sort,
	page,
	pageSize = DEFAULT_PAGE_SIZE,
	limiter,
}: FetchForumThreadPageOptions): Promise<ForumThreadPageSnapshot> {
	const effect = getThreads({
		fname,
		page,
		sort,
		rn: pageSize,
	});
	const data = limiter
		? await runLimited(limiter, effect)
		: await Effect.runPromise(effect);
	return normalizeForumThreadPage(data);
}

// Shared forum-list fetch helper. It filters pinned threads because they do
// not behave like normal timeline items, and page 1 usually contains fewer
// timeline threads than later pages.
export async function fetchForumThreadsEnough({
	fname,
	sort,
	targetCount,
	pageSize = DEFAULT_PAGE_SIZE,
	concurrency = DEFAULT_BATCH_SIZE,
	maxPages = DEFAULT_MAX_PAGES,
	limiter,
}: FetchForumThreadsOptions): Promise<ForumThreadInfo[]> {
	const wanted = Math.max(1, targetCount);
	const pages = estimateForumThreadPages(wanted, maxPages);
	const pageNumbers = Array.from({ length: pages }, (_, i) => i + 1);
	const pageResults = await mapWithConcurrency(
		pageNumbers,
		Math.min(concurrency, pages),
		(page) =>
			fetchForumThreadPage({
				fname,
				page,
				sort,
				pageSize,
				limiter,
			}),
	);

	const threads = pageResults.flatMap((result) => result.timelineThreads);

	if (threads.length < wanted && pages < maxPages) {
		const extraPageResult = await fetchForumThreadPage({
			fname,
			page: pages + 1,
			sort,
			pageSize,
			limiter,
		});
		threads.push(...extraPageResult.timelineThreads);
	}

	return threads.slice(0, wanted);
}
