import {Hono} from "hono/quick";

import {getForumName} from "../utils.mjs";
import {threadReqSerialize, threadResDeserialize} from "../ProtobufParser.mjs";
import {postProtobuf, unpackThread, processContent, countUserAttributes} from "../utils.mjs";
import { type } from "os";

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
    const { forum, thread } = data[0]; // 只取第一个 DataRes 对象中的 forum 和 thread 属性
    const { page } = data[data.length - 1]; // 取最后一个 DataRes 对象中的 page 属性
    responseData = { // 创建合并后的对象
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
  let toResponse = { result: {} }
  if (!params.hasOwnProperty('require')) { params['require'] = 'threadList,forum,pidList,counter,timeLine'; }
  const require = params.require.split(',');
  const [threadList, emojicounter, emoticonCounter] = await unpackThread(responseData.threadList, require.includes('plainText'));
  threadList.map( thread => { processContent([{type: 0, text: thread.title}], emojicounter, emoticonCounter) }) //统计标题的emoji
  if (require.includes('threadList')) {
    toResponse.result = {...toResponse.result, threadList};
  }
  if (require.includes('userList')) {
    toResponse.result = {...toResponse.result, userList: responseData.userList};
  }
  if (require.includes('forum')) {
    toResponse.result = {...toResponse.result, forum: responseData.forum};
  }
  if (require.includes('pidList')) {
    let pidList = threadList.map(thread => thread.id);
    toResponse.result = {...toResponse.result, pidList};
  }
  if (require.includes('counter')) {
    toResponse.result = {...toResponse.result,
      emojicounter, emoticonCounter, userAttributesCount: countUserAttributes(responseData.userList)};
  }
  if (require.includes('plainText')) {
    let contentList = threadList.map(thread => thread.title+" "+thread.firstPostContent);
    toResponse.result = {...toResponse.result, contentList};
  }
  if (require.includes('timeLine')) {
    let timeLine = threadList.map(thread => thread.createTime);
    timeLine.sort((a, b) => a - b);
    toResponse.result = {...toResponse.result, timeLine};
  }
  toResponse.cost = new Date().getTime() - time;
  toResponse.length =  responseData.threadList.length;
  return c.json(toResponse);
})

export default forum;