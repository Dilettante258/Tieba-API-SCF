import { existsSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { build } from "esbuild";

const shimCandidates = [
	resolve("node_modules/tieba.js/dist/shims/undici.js"),
	resolve("../../packages/sdk/dist/shims/undici.js"),
];

const undiciShim = shimCandidates.find((path) => existsSync(path));

if (!undiciShim) {
	throw new Error(
		`Cannot find tieba.js undici shim. Checked: ${shimCandidates.join(", ")}`,
	);
}

rmSync("out-worker", { recursive: true, force: true });

await build({
	entryPoints: ["src/worker.ts"],
	bundle: true,
	platform: "node",
	format: "esm",
	target: "node22",
	outfile: "out-worker/worker.js",
	plugins: [
		{
			name: "tieba-undici-shim",
			setup(builder) {
				builder.onResolve({ filter: /^undici$/ }, () => ({ path: undiciShim }));
			},
		},
	],
});
