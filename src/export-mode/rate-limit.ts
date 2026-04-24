import { setTimeout as sleep } from "node:timers/promises";

export class RateLimiter {
	private nextAt = 0;

	constructor(private readonly minIntervalMs: number) {}

	async wait(): Promise<void> {
		if (this.minIntervalMs <= 0) return;

		const now = Date.now();
		if (this.nextAt > now) {
			await sleep(this.nextAt - now);
		}
		this.nextAt = Date.now() + this.minIntervalMs;
	}
}
