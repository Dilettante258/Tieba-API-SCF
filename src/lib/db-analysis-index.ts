import type { Pool } from "pg";

const STATE_KEY = "user_forum_pairs";
const ADVISORY_LOCK_KEY = 1_163_288_211;

export interface AnalysisIndexStatus {
	status: "never" | "refreshing" | "ready" | "failed";
	startedAt: string | null;
	refreshedAt: string | null;
	errorMessage: string | null;
}

export async function getAnalysisIndexStatus(
	pool: Pool,
): Promise<AnalysisIndexStatus> {
	const result = await pool.query<{
		status: AnalysisIndexStatus["status"];
		started_at: Date | null;
		refreshed_at: Date | null;
		error_message: string | null;
	}>(
		`SELECT status, started_at, refreshed_at, error_message
		 FROM eazy_tieba.db_analysis_state WHERE key = $1`,
		[STATE_KEY],
	);
	const row = result.rows[0];
	return {
		status: row?.status ?? "never",
		startedAt: row?.started_at?.toISOString() ?? null,
		refreshedAt: row?.refreshed_at?.toISOString() ?? null,
		errorMessage: row?.error_message ?? null,
	};
}

/**
 * 使用同一个 PostgreSQL session 持有 advisory lock。CONCURRENTLY 不能放进事务，
 * 因而不能使用 transaction advisory lock。
 */
export async function refreshAnalysisIndex(
	pool: Pool,
): Promise<{ refreshed: boolean; status: AnalysisIndexStatus }> {
	const client = await pool.connect();
	let locked = false;
	try {
		const lockResult = await client.query<{ locked: boolean }>(
			"SELECT pg_try_advisory_lock($1) AS locked",
			[ADVISORY_LOCK_KEY],
		);
		locked = lockResult.rows[0]?.locked === true;
		if (!locked) {
			return { refreshed: false, status: await getAnalysisIndexStatus(pool) };
		}

		await client.query(
			`INSERT INTO eazy_tieba.db_analysis_state
			   (key, status, started_at, error_message, updated_at)
			 VALUES ($1, 'refreshing', now(), NULL, now())
			 ON CONFLICT (key) DO UPDATE SET
			   status = 'refreshing', started_at = now(), error_message = NULL,
			   updated_at = now()`,
			[STATE_KEY],
		);

		try {
			await client.query(
				"REFRESH MATERIALIZED VIEW CONCURRENTLY eazy_tieba.user_forum_pairs",
			);
			await client.query(
				`UPDATE eazy_tieba.db_analysis_state SET
				   status = 'ready', refreshed_at = now(), error_message = NULL,
				   updated_at = now() WHERE key = $1`,
				[STATE_KEY],
			);
		} catch (error) {
			const message = error instanceof Error ? error.message : String(error);
			await client.query(
				`UPDATE eazy_tieba.db_analysis_state SET
				   status = 'failed', error_message = $2, updated_at = now()
				 WHERE key = $1`,
				[STATE_KEY, message.slice(0, 2000)],
			);
			throw error;
		}

		return { refreshed: true, status: await getAnalysisIndexStatus(pool) };
	} finally {
		if (locked) {
			await client.query("SELECT pg_advisory_unlock($1)", [ADVISORY_LOCK_KEY]);
		}
		client.release();
	}
}
