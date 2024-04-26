import {Hono} from "hono/quick";

import {getForumName} from "../utils.mjs";
import {threadReqSerialize, threadResDeserialize} from "../ProtobufParser.mjs";
import {postProtobuf, unpackThread} from "../utils.mjs";

const forum = new Hono()

forum.get('/getName',  async (c) => {
  const params  = c.req.query();
  const fname = await getForumName(params['fid']);
  return c.text(fname)
})

forum.get('/getThreads',  async (c) => {
  const time = new Date().getTime();
  let params  = c.req.query()
  let responseData;
  if (params.hasOwnProperty('batch')) {
    const promises = [];
    const [from,to] =  params['batch'].split(',');
    for (let i = Number(from); i <= Number(to); i++) {
      params['page'] = i;
      promises.push(threadReqSerialize(params));
    }
    const buffers = await Promise.all(promises);
    const results = await Promise.all(buffers.map(buffer => postProtobuf('/c/f/frs/page?cmd=303002', buffer)));
    let data = await Promise.all(results.map(res => threadResDeserialize(res)));
    data = data.flat()
    const allThreads = data.flatMap(item => item.threadList);
    const allUsers = data.flatMap(item => item.userList);

    // 假设我们只取第一个 DataRes 对象中的 forum 和 thread 属性
    const { forum, thread } = data[0];

    // 取最后一个 DataRes 对象中的 page 属性
    const { page } = data[data.length - 1];

    // 创建合并后的对象
    responseData = {
      threadList: allThreads,
      userList: allUsers,
      forum,
      page,
      thread
    };
  } else {
    const buffer = await threadReqSerialize(params);
    const res = await postProtobuf('/c/f/frs/page?cmd=303002', buffer);
    if (res.byteLength < 200) {
      return c.json({
        "code": 404,
        "data": []
      }, 404);
    }
    responseData = await threadResDeserialize(res);
  }
  if (params.hasOwnProperty('raw')) {
    return c.json(responseData);
  }
  const [threadList, emojicounter, emoticonCounter] = await unpackThread(responseData.threadList);
  const forumInfo = responseData.forum;
  const userList =  responseData.userList;
  return c.json({result: {threadList, forumInfo, userList, emojicounter, emoticonCounter}, cost: new Date().getTime() - time, length: responseData.length});
})

export default forum;