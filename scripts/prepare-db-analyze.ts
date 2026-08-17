import pg from "pg";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required");

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const managedTextSearchIndexes = [
	"tieba_threads_title_trgm_idx",
	"tieba_threads_first_post_text_trgm_idx",
	"tieba_posts_content_trgm_idx",
	"tieba_sub_posts_content_trgm_idx",
	"tieba_threads_title_bigram_idx",
	"tieba_threads_first_post_text_bigram_idx",
	"tieba_posts_content_bigram_idx",
	"tieba_sub_posts_content_bigram_idx",
	"tieba_threads_title_expanded_trgm_idx",
	"tieba_threads_first_post_text_expanded_trgm_idx",
	"tieba_posts_content_expanded_trgm_idx",
	"tieba_sub_posts_content_expanded_trgm_idx",
] as const;

const statements = [
	"DROP FUNCTION IF EXISTS eazy_tieba.expand_bigrams(text)",
	"DROP FUNCTION IF EXISTS eazy_tieba.text_bigrams(text)",
	`CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_ufp_author_forum_unique
	 ON eazy_tieba.user_forum_pairs (author_id, forum_id)`,
	`CREATE INDEX CONCURRENTLY IF NOT EXISTS tieba_posts_forum_author_time_idx
	 ON eazy_tieba.tieba_posts (forum_id, author_id, create_time DESC)`,
	`DROP INDEX CONCURRENTLY IF EXISTS eazy_tieba.idx_ufp_author_forum`,
];

try {
	for (const indexName of managedTextSearchIndexes) {
		console.log(`DROP UNUSED TEXT SEARCH INDEX ${indexName}`);
		await client.query(
			`DROP INDEX CONCURRENTLY IF EXISTS eazy_tieba."${indexName}"`,
		);
	}
	for (const statement of statements) {
		console.log(statement.split("\n")[0]);
		await client.query(statement);
	}
	await client.query(
		"REFRESH MATERIALIZED VIEW CONCURRENTLY eazy_tieba.user_forum_pairs",
	);
	await client.query(
		`INSERT INTO eazy_tieba.db_analysis_state
		   (key, status, started_at, refreshed_at, error_message, updated_at)
		 VALUES ('user_forum_pairs', 'ready', now(), now(), NULL, now())
		 ON CONFLICT (key) DO UPDATE SET
		   status = 'ready', started_at = now(), refreshed_at = now(),
		   error_message = NULL, updated_at = now()`,
	);
	console.log("数据库分析结构已准备并刷新（关键词查询不使用专用索引）。");
} finally {
	await client.end();
}
