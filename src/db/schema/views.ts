import { sql } from "drizzle-orm";
import { text } from "drizzle-orm/pg-core";
import { appDbSchema } from "./shared.ts";

// 预计算所有 (author_id, forum_id) distinct 对，供 forum-overlap 接口使用。
// 索引需创建后手动执行：
//   CREATE INDEX idx_ufp_forum_author ON eazy_tieba.user_forum_pairs (forum_id, author_id);
//   CREATE INDEX idx_ufp_author_forum ON eazy_tieba.user_forum_pairs (author_id, forum_id);
// 数据同步：REFRESH MATERIALIZED VIEW CONCURRENTLY eazy_tieba.user_forum_pairs
export const userForumPairs = appDbSchema
	.materializedView("user_forum_pairs", {
		authorId: text("author_id").notNull(),
		forumId: text("forum_id").notNull(),
	})
	.as(sql`
    SELECT author_id, forum_id
    FROM (
      SELECT author_id, forum_id FROM eazy_tieba.tieba_posts
        WHERE author_id IS NOT NULL AND forum_id IS NOT NULL
      UNION
      SELECT author_id, forum_id FROM eazy_tieba.tieba_threads
        WHERE author_id IS NOT NULL AND forum_id IS NOT NULL
      UNION
      SELECT sp.author_id, p.forum_id
      FROM eazy_tieba.tieba_sub_posts sp
      JOIN eazy_tieba.tieba_posts p ON sp.post_id = p.id
        WHERE sp.author_id IS NOT NULL AND p.forum_id IS NOT NULL
    ) t
    GROUP BY author_id, forum_id
  `);
