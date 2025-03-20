import pLimit from 'p-limit';
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { forumKeyTable, postTable, subPostTable } from "../db/schema/tieba.js";
import { collatePost, Config, getForumID, getPost, getThreadPid } from "tieba.js";
import log4js from "log4js";

log4js.configure({
  appenders: {
    console: { type: "console" },
    app: { type: "file", filename: "application.log" },
  },
  categories: {
    default: { appenders: ["console"], level: "trace" },
    app: { appenders: ["app"], level: "trace" },
    "app.console": { appenders: ["console"], level: "info" },
  },
});

Config.init({
  bduss: "",
  needTimestamp: true
});

const logger = log4js.getLogger("app.console");
logger.info("程序启动。");

const db = drizzle(process.env.DATABASE_URL!);

// 失败计数器
let failureCount = 0;

const MAX_CONCURRENT_REQUESTS = 3;
const limit = pLimit(MAX_CONCURRENT_REQUESTS);

async function getAllPid(fname: string) {
  const startTime = Date.now();
  logger.trace(`开始获取${fname}吧的主题帖列表`);
  const commonParams = {
    fname: fname,
    rn: 100,
    sort: 0,
    OnlyGood: false
  };
  const N1Res = await getThreadPid({
    ...commonParams,
    page: 1
  });
  const N2Res = await getThreadPid({
    ...commonParams,
    page: 2
  });
  const totalPage = Math.min(200, N2Res.page.totalPage);
  logger.info(`${fname}吧最多支持获取${N2Res.page.totalPage}页，实际计划获取${totalPage}页`);
  const delay = 2000;
  const pages = [];
  for (let i = 3; i <= totalPage; i++) {
    pages.push(i);
  }

  const pidListQueue: Array<Array<string>> = [];

  // 使用 pLimit 限制并发数量
  const processPage = async (page: number) => {
    await sleep(delay * Math.random()); // 添加延迟
    try {
      await sleep(2000 * Math.random());
      const data = await getThreadPid({
        ...commonParams,
        page: page
      });
      return data.pidList;
    } catch (reason) {
      logger.error(`获取${fname}吧第${page}页主题帖列表失败，原因：${reason}`);
      failureCount++; // 失败次数加1
      if (failureCount >= 10) {
        logger.warn("失败次数达到10次，休眠30秒...");
        await sleep(30000); // 休眠30秒
        failureCount = 0; // 重置失败计数器
      }
      return [];
    }
  };

  const pagePromises = pages.map((page) => limit(() => processPage(page)));
  const results = await Promise.all(pagePromises);
  results.forEach((result) => pidListQueue.push(result));

  const allPidLists = [N1Res.pidList, N2Res.pidList, ...pidListQueue];
  const flatPidLists = allPidLists.flat();
  logger.info(`${fname}吧合并去重前有${flatPidLists.length}个主题帖的pid号`);
  const pidList = [...new Set(flatPidLists)];
  logger.info(`共获取了${fname}吧的${pidList.length}个主题帖的pid号`);
  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  logger.info(`获取${fname}吧的所有贴子的PID号总共耗时 ${duration.toFixed(4)}秒。`);
  return pidList;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function insertPostToDB(pid: string) {
  logger.trace(`正在获取主题帖${pid}`);
  let posts = await getPost(Number(pid), 'ALL', false, true);
  let postList: Array<typeof postTable.$inferInsert> = [];
  let subPostList: Array<typeof subPostTable.$inferInsert> = [];
  collatePost(posts.postList).map((post) => {
    postList.push({
      forumId: Number(posts.forum.id),
      postId: pid,
      id: post.id,
      floor: post.floor,
      time: new Date(post.time * 1000),
      content: post.content,
      subPostNumber: post.subPostNumber,
      authorId: post.authorId,
      agreeNum: Number(post?.agree?.agreeNum),
      disagreeNum: Number(post?.agree?.disagreeNum),
      ipAddress: posts.userList.find((item) => (item.id === post.authorId))?.ipAddress || '',
    });
    if (post.subPostNumber > 0 && post.subPostList) {
      post.subPostList.map((subPost) => {
        subPostList.push({
          postId: post.id,
          id: subPost.id,
          time: new Date(subPost.time * 1000),
          content: subPost.content,
          authorId: subPost.authorId,
          otherId: subPost?.otherId,
          otherName: subPost?.otherName,
        });
      });
    }
  });
  logger.trace(`贴吧${posts.forum.id}|主题帖${pid}-数据插入数据库中`);
  await db.insert(postTable).values(postList).onConflictDoNothing();
  if (subPostList.length > 0) {
    await db.insert(subPostTable).values(subPostList).onConflictDoNothing();
  }
}

const pE = (e: unknown) => e instanceof Error ? e.message : e;

async function handleForum(forum: string) {
  logger.info(`开始处理${forum}吧`);
  try {
    // 插入贴吧信息到数据库
    await db.insert(forumKeyTable).values({
      id: await getForumID(forum),
      name: forum
    }).onConflictDoNothing();
    let pidList = await getAllPid(forum);
    if (pidList.length > 2000) {
      logger.info("主题帖过多 进行裁剪。");
      pidList = pidList.slice(0, 1999);
    }
    await processPostList(pidList); // 调用批量处理函数
  } catch (e) {
    logger.error(`贴吧${forum}吧主题帖列表获取失败！${pE(e)}`);
  }
}

async function processPostList(pidList: string[]) {
  const startTime = Date.now();
  const delay = 3000;

  // 使用 pLimit 限制并发数量
  const processPid = async (pid: string) => {
    try {
      await sleep(4000 * Math.random());
      await insertPostToDB(pid);
    } catch (e) {
      logger.error(`主题帖${pid}获取失败！${pE(e)}`);
      failureCount++; // 失败次数加1
      if (failureCount >= 10) {
        logger.warn("失败次数达到10次，休眠30秒...");
        failureCount = 0; // 重置失败计数器
        await sleep(30000); // 休眠30秒
      }
    }
  };

  const pidPromises = pidList.map((pid) => limit(() => processPid(pid)));
  await Promise.all(pidPromises);

  const endTime = Date.now();
  const duration = (endTime - startTime) / 1000;
  logger.info(`处理了${pidList.length}个主题帖总共耗时 ${duration.toFixed(4)}秒`);
}

async function main() {
  const forumList = [
    "摩洛哥"
  ];

  for (const forum of forumList) {
    const startTime = Date.now();
    await handleForum(forum);
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;
    logger.info(`储存${forum}吧的贴子总共耗时 ${duration.toFixed(4)}秒。`);
  }
}

await main();
