import { serve } from "@hono/node-server";
import dotenv from "dotenv";
import { resolve } from "node:path";
import { createApp } from "./app.ts";
import { setupClient } from "./lib/sdk.ts";

if (!process.env.production) {
	dotenv.config({ path: resolve(import.meta.dirname, "../../../.env") });
}
setupClient();

const app = createApp({ cacheRuntime: "server" });

export type AppType = typeof app;

const port = Number(process.env.PORT) || 8000;
console.log(`Server is running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
