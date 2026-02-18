import { TiebaClient, initClient } from "@tieba/sdk";

export function setupClient(): void {
	const bduss = process.env.BDUSS;
	if (!bduss) {
		throw new Error("BDUSS 环境变量未设置");
	}
	initClient(new TiebaClient({ bduss }));
}
