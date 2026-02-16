import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { forumRoute } from "./routes/forum.ts";
import { postRoute } from "./routes/post.ts";
import { userRoute } from "./routes/user.ts";
import { handleError } from "./utils/error.ts";

import "dotenv/config";

const app = new Hono()
	.use(
		"*",
		cors({
			origin: [
				"http://localhost:3000",
				"http://localhost:5173",
				"https://tb.wang1m.tech",
				"https://www.eztb.org",
			],
			allowMethods: ["GET", "POST", "OPTIONS"],
			maxAge: 600,
			credentials: true,
		}),
	)
	.route("/user", userRoute)
	.route("/post", postRoute)
	.route("/forum", forumRoute);

app.onError(handleError);

app.get("/", (c) => c.json({ status: "ok", version: "2.0.0" }));

export type AppType = typeof app;

const port = Number(process.env.PORT) || 8000;
console.log(`Server is running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });
