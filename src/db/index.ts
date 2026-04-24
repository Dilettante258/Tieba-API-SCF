import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema/index.ts";

export type TiebaDb = NodePgDatabase<typeof schema>;

export interface DbClient {
	db: TiebaDb;
	pool: Pool;
}

let defaultClient: DbClient | null = null;

export function createDb(databaseUrl = process.env.DATABASE_URL): DbClient {
	if (!databaseUrl) {
		throw new Error("DATABASE_URL is required to initialize the database");
	}

	const pool = new Pool({ connectionString: databaseUrl });
	return { db: drizzle(pool, { schema }), pool };
}

export function getDb(): TiebaDb {
	defaultClient ??= createDb();
	return defaultClient.db;
}

export async function closeDb(): Promise<void> {
	if (!defaultClient) return;
	await defaultClient.pool.end();
	defaultClient = null;
}

export const db = new Proxy({} as TiebaDb, {
	get(_target, prop, receiver) {
		return Reflect.get(getDb(), prop, receiver);
	},
});
