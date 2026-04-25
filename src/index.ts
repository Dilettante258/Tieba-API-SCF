import { serve } from "@hono/node-server";
import { createApp } from "./app.ts";
import { runExportMode } from "./export-mode/runner.ts";
import { setupClient } from "./lib/sdk.ts";

const isExportMode =
	process.env.EXPORT_MODE === "true" || process.argv.includes("--export");

export type AppType = ReturnType<typeof createApp>;

const port = Number(process.env.PORT) || 8000;

async function main(): Promise<void> {
	if (isExportMode) {
		await runExportMode();
		return;
	}

	setupClient();
	const app = createApp({ cacheRuntime: "server" });

	console.log(`Server is running on http://localhost:${port}`);
	serve({ fetch: app.fetch, port });
}

void main().catch((error) => {
	console.error(error);
	process.exit(1);
});
