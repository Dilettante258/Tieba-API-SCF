import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExportConfigFile } from "../src/export-mode/config";

type ExportTargetExample = NonNullable<ExportConfigFile["targets"]>[number];
type ExportConfigExample = ExportConfigFile & {
	targets: ExportTargetExample[];
};

const DEFAULT_OUTPUT = "export.config.example.json";

function printHelp(): void {
	console.log(`Usage:
  bun scripts/generate-export-config.ts [--out <path>] [--force]

Examples:
  bun scripts/generate-export-config.ts
  bun scripts/generate-export-config.ts --out export.config.json
  bun scripts/generate-export-config.ts --out ../../export.config.json --force
`);
}

function parseArgs(argv: string[]): { out: string; force: boolean; } {
	let out = DEFAULT_OUTPUT;
	let force = false;

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--help" || arg === "-h") {
			printHelp();
			process.exit(0);
		}
		if (arg === "--force" || arg === "-f") {
			force = true;
			continue;
		}
		if (arg === "--out" || arg === "-o") {
			const value = argv[i + 1];
			if (!value) throw new Error(`${arg} requires a path`);
			out = value;
			i += 1;
			continue;
		}
		throw new Error(`Unknown argument: ${arg}`);
	}

	return { out, force };
}

function createExampleConfig(): ExportConfigExample {
	return {
		name: "tieba-export-corpus",
		// jobKey: "tieba-export-corpus:v1",
		// databaseUrl: "postgres://postgres:postgres@localhost:5432/tieba",
		// bduss: "put-bduss-in-env-instead",
		crawl: {
			sort: 1,
			pageSize: 100,
			maxForumPages: 500,
			maxThreadPages: 600,
			includeComments: true,
			activeSubPostFetch: false,
			activeSubPostPageLimit: 20,
		},
		rate: {
			requestsPerMinute: 30,
			// minIntervalMs: 2000,
		},
		worker: {
			leaseSeconds: 300,
			claimBatchSize: 2,
			maxTaskAttempts: 5,
			maxScanAttempts: 5,
			idlePollMs: 5000,
		},
		notify: {
			recipients: ["ops@example.com", "owner@example.com"],
			progressIntervalMinutes: 30,
			enabled: true,
		},
		targets: [
			{
				forumName: "v",
				startTime: "2025-06-01",
				endTime: "now",
				sort: 1,
				pageSize: 100,
				maxForumPages: 500,
				maxThreadPages: 600,
				// maxThreads: 1000,
				includeComments: true,
				activeSubPostFetch: false,
				activeSubPostPageLimit: 20,
			},
			{
				forumName: "cpp",
				startTime: "2025-01-01",
				endTime: "2025-12-31",
				sort: 1,
				pageSize: 100,
				maxForumPages: 200,
				maxThreadPages: 200,
				maxThreads: 500,
				includeComments: true,
				activeSubPostFetch: false,
				activeSubPostPageLimit: 10,
			},
		],
	};
}

async function main(): Promise<void> {
	const { out, force } = parseArgs(process.argv.slice(2));
	const outputPath = resolve(process.cwd(), out);
	if (existsSync(outputPath) && !force) {
		throw new Error(
			`Refusing to overwrite ${outputPath}. Pass --force to replace it.`,
		);
	}

	await mkdir(dirname(outputPath), { recursive: true });
	await writeFile(
		outputPath,
		`${JSON.stringify(createExampleConfig(), null, "\t")}\n`,
		"utf8",
	);

	console.log(`Wrote ${outputPath}`);
	console.log("Set EXPORT_CONFIG_FILE to this path when running export mode.");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
	main().catch((err) => {
		console.error(err instanceof Error ? err.message : err);
		process.exit(1);
	});
}
