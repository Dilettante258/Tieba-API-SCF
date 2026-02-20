import { createApp } from "./app.ts";
import { setupClient } from "./lib/sdk.ts";

type WorkerEnv = {
	BDUSS: string;
};

const app = createApp({ cacheRuntime: "worker" });

export default {
	fetch(request: Request, env: WorkerEnv) {
		// Worker 场景下从环境变量注入 BDUSS。
		setupClient(env.BDUSS);
		return app.fetch(request, env);
	},
};
