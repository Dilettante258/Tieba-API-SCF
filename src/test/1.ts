import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import {postTable, subPostTable, userPostTable} from "../db/schema/tieba.js";
import {Config, getPost, getUserPost} from "tieba.js";
import {collatePost} from "tieba.js";
import {integer, varchar} from "drizzle-orm/pg-core";

const db = drizzle(process.env.DATABASE_URL!);



async function main() {
  let userPosts = await getUserPost(5991323492, 1,10);
  userPosts.map(async (post) => {
    await db.insert(userPostTable).values({
      ...post,
      uid: '5991323492',
      createTime: new Date((post.createTime as number) * 1000),
    }).onConflictDoNothing();
  })

  let posts = await getPost(9251792258,'ALL',false,true);
  collatePost(posts.postList).map(async (post) => {
    await db.insert(postTable).values({
      forumId: '1',
      postId: varchar({ length: 12 }).notNull(),
      floor: post.floor,
      time: new Date((post.time as number) * 1000),
      content: post.content,
      subPostNumber: post.subPostNumber,
      authorId: post.authorId,
      agreeNum: post.agree.agreeNum,
      disagreeNum: post.agree.disagreeNum,
      ipAddress: posts.userList.find((item)=>(item.id === post.authorId))?.ipAddress,
    }).onConflictDoNothing();
    if (post.subPostNumber>0&&post.subPostList) {
      post.subPostList.map(async (subPost) => {
        await db.insert(subPostTable).values({
          postId: '9251792258',
          id: subPost.id,
          time: new Date((subPost.time as number) * 1000),
          content: subPost.content,
          authorId: subPost.authorId,
          otherId: subPost?.otherId,
          otherName: subPost?.otherName,
        }).onConflictDoNothing();
      })
  }})
}

main();
