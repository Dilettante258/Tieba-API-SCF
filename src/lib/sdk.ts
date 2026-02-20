import { TiebaClient, initClient } from "tieba.js";

let initializedBduss: string | null = null;

/**
 * 初始化 tieba.js 客户端。
 * 支持 Node 环境变量和 Worker 运行时注入两种方式。
 */
export function setupClient(overrideBduss?: string): void {
	const bduss = overrideBduss ?? process.env.BDUSS;
	if (!bduss) {
		throw new Error("BDUSS 环境变量未设置");
	}

	// 同一个 BDUSS 重复调用时直接复用，避免重复创建客户端实例。
	if (initializedBduss === bduss) {
		return;
	}

	initClient(new TiebaClient({ bduss }));
	initializedBduss = bduss;
}
