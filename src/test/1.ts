import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import {postTable, subPostTable, userPostTable} from "../db/schema/tieba.js";
import {getPost, getUserPost} from "tieba.js";
import {collatePost} from "../../../../../../Repository/tieba.js/src/utils/index.js";

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
      id: post.id,
      floor: post.floor,
      time: new Date((post.time as number) * 1000),
      content: post.content,
      subPostNumber: post.subPostNumber,
      authorId: post.authorId,
      agree: post.agree,
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

  console.log('New user created!')
  //
  // const users = await db.select().from(userPostTable);
  // console.log('Getting all users from the database: ', users)
  /*
  const users: {
    id: number;
    name: string;
    age: number;
    email: string;
  }[]
  */

  // await db
  //   .update(userPostTable)
  //   .set({
  //     age: 31,
  //   })
  //   .where(eq(userPostTable.email, user.email));
  // console.log('User info updated!')

  // await db.delete(userPostTable).where(eq(userPostTable.email, user.email));
  console.log('User deleted!')
}

main();
