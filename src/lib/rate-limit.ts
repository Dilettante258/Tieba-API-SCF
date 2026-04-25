/**
 * 限速器只约束本进程发起 Tieba API 请求的启动节奏。
 * 它不承担跨容器并发控制，也不负责“哪一个帖子由谁爬”的分配。
 * 多实例之间的互斥、断点续跑和任务领取必须交给 PostgreSQL lease。
 * 当前封装基于 Effect RateLimiter，方便复用到 API 路由和 export worker。
 */
import { Effect, RateLimiter as EffectRateLimiter, Exit, Scope } from "effect";

export interface RateLimiter {
	readonly run: <A, E>(effect: Effect.Effect<A, E, never>) => Promise<A>;
	readonly close: () => Promise<void>;
}

export async function makeRateLimiter(
	minIntervalMs: number,
): Promise<RateLimiter> {
	if (minIntervalMs <= 0) {
		return {
			run: (effect) => Effect.runPromise(effect),
			close: async () => {},
		};
	}

	const scope = await Effect.runPromise(Scope.make());
	const limit = await Effect.runPromise(
		Scope.extend(
			EffectRateLimiter.make({
				limit: 1,
				interval: `${minIntervalMs} millis`,
				algorithm: "token-bucket",
			}),
			scope,
		),
	);

	return {
		run: (effect) => Effect.runPromise(limit(effect)),
		close: () => Effect.runPromise(Scope.close(scope, Exit.void)),
	};
}

export function runLimited<A, E>(
	limiter: RateLimiter,
	effect: Effect.Effect<A, E, never>,
): Promise<A> {
	return limiter.run(effect);
}
