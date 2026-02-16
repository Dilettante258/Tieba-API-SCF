import { TiebaClient } from "@tieba/sdk";

let client: TiebaClient | null = null;

export function getClient(): TiebaClient {
	if (!client) {
		const bduss = process.env.BDUSS;
		if (!bduss) {
			throw new Error("BDUSS 环境变量未设置");
		}
		client = new TiebaClient({ bduss });
	}
	return client;
}
