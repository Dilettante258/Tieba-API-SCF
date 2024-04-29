import {Hono} from "hono/quick";

import {getForumName, handlePromises, mergeCounters} from "../utils.mjs";
import {threadReqSerialize, threadResDeserialize} from "../ProtobufParser.mjs";
import {postProtobuf, unpackThread, processContent, countUserAttributes} from "../utils.mjs";


const forum = new Hono()

forum.get('/getName',  async (c) => {
  const params  = c.req.query();
  const fname = await getForumName(params['fid']);
  return c.text(fname)
})

export async function getThread(params) {
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
    return responseData;
  }
  let toResponse = { result: {} }
  if (!params.hasOwnProperty('require')) { params['require'] = 'threadList,forum,tidList,counter,timeLine'; }
  const require = params.require.split(',');
  let temp_threadList;
  if(params.hasOwnProperty('filterUsers')) {
    const filterUsers = params.filterUsers.split(',');
    temp_threadList = responseData.threadList.filter(thread => filterUsers.includes(String(thread.authorId)) );
  }
  let [threadList, emojicounter, emoticonCounter] = await unpackThread(temp_threadList||responseData.threadList, require.includes('plainText'));
  responseData.threadList = null;
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
  if (require.includes('page')) {
    toResponse.result = {...toResponse.result, page: responseData.page};
  }
  if (require.includes('tidList')) {
    let tidList = threadList.map(thread => thread.id);
    toResponse.result = {...toResponse.result, tidList};
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
  toResponse.length =  threadList.length;
  return toResponse;
}


forum.get('/getThreads',  async (c) => {
  const time = new Date().getTime();
  let params  = c.req.query();
  let toResponse = await getThread(params);
  toResponse.cost = new Date().getTime() - time;
  return c.json(toResponse);
})

import {getPost} from "./post.mjs";

forum.get('/getBatchPostDetail',  async (c) => {
  let toResponse = {};
  const time = new Date().getTime();
  let params  = c.req.query();
  let getThreadParams = {
    ...params,
    rn: params.rn || 100,
    require: 'tidList',
  }
  delete getThreadParams.filterUsers;
  let { result: {tidList} } = await getThread(getThreadParams);
  let promises = [];
  if(!params.hasOwnProperty('require')) {
    params.require = "postList";
  }
  if(params.hasOwnProperty('forToolbox')) {
    params.require = "postList,counter,timeLine,plainText";
  }
  for(let i = 0; i < tidList.length; i++) {
    let getPostParams = {
      ...params,
      tid: tidList[i],
      require: params.require || 'postList',
      needAll: true,
      maxPage: 30,
    }
    delete getPostParams.page;
    promises.push(getPost(getPostParams));
  }
  let results = await handlePromises(promises, 300, params.sleepTime||3500);
  
  if(params.require.includes('postList')) {
    let postList = results.flatMap( t => t.postList)
    toResponse.postList = postList;
  }
  if(params.hasOwnProperty('forToolbox')) {
    let postList = toResponse.postList.flatMap( t => t.content)
    toResponse.postList = postList;
  }
  if (params.require.includes('counter')) {
    toResponse.counter = mergeCounters(results);
  }
  toResponse.cost = new Date().getTime() - time;
  return c.json(toResponse);
})

export default forum;