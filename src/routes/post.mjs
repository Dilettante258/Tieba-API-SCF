import {Hono} from "hono/quick";

import {postReqSerialize, postResDeserialize} from "../ProtobufParser.mjs";
import {postProtobuf, unpackPost, countUserAttributes} from "../utils.mjs";

const user = new Hono()

user.get('/', (c) => c.text('Post Api')) // GET /user



export async function getPost(params) {
  let responseData;
  const buffer = await postReqSerialize(params);
  let res;
  try {
    res = await postProtobuf('/c/f/pb/page?cmd=303002', buffer);
  } catch (e) {
    return null;
  }
  if (res.byteLength < 200) {
    return null;
  }
  try {
    responseData = await postResDeserialize(res);
  } catch (e) {
    return null;
  }
  if (params.hasOwnProperty('needAll') && responseData.page.totalPage !== '1') {
    let totalPage = Number(responseData.page.totalPage);
    if (params.hasOwnProperty('maxPage')) {
        totalPage = Math.min(totalPage, Number(params.maxPage)); // limit totalPage to maxPage if it exists
    }
    let batch = 1;
    if (totalPage > 70 && totalPage <= 250) batch = 2;
    if (totalPage > 250) batch = 3;
    if (totalPage > 400) batch = 4;
    if (totalPage > 600) batch = 8;
    const batchSize = Math.ceil(totalPage / batch);

    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    let allPosts = [];
    let allUsers = [];

    for (let b = 0; b < batch; b++) {
        const promises = [];
        for (let i = b * batchSize + 2; i <= (b + 1) * batchSize && i <= totalPage; i++) {
            params.page = i.toString();
            promises.push(postReqSerialize(params));
        }
        const buffers = await Promise.all(promises);
        const results = await Promise.all(buffers.map(buffer => postProtobuf('/c/f/pb/page?cmd=303002', buffer)));
        let temp = await Promise.all(results.map(res => postResDeserialize(res)));
        temp = temp.flat();
        const batchPosts = temp.map(item => item.postList).reduce((acc, val) => acc.concat(val), []);
        const batchUsers = temp.map(item => item.userList).reduce((acc, val) => acc.concat(val), []);
        allPosts.push(...batchPosts);
        allUsers.push(...batchUsers);
        if (b < batch - 1) await delay(1000); // sleep 1 second between batches
    }

    responseData.postList.push(...allPosts);
    responseData.userList.push(...allUsers);
  }

  let result = {}
  if (params.hasOwnProperty('raw')) {
    return responseData;
  }
  
  let temp_postList;
  if(params.hasOwnProperty('filterUsers')) {
    const filterUsers = params.filterUsers.split(',');
    temp_postList = responseData.postList.filter(post => filterUsers.includes(String(post.authorId)) );
  }

  if (!params.hasOwnProperty('require')) { params['require'] = 'postList,thread,forum,counter,timeLine,withComment'; }
  const require = params.require.split(',');
  let [postList, emojicounter, emoticonCounter] = await unpackPost(temp_postList||responseData.postList, require.includes('plainText'), params.hasOwnProperty('withComment'));
  responseData.postList = null;  
  if (require.includes('postList')) {
    result = {...result, postList};
  }
  if (require.includes('userList')) {
    result = {...result, userList: responseData.userList};
  }
  if (require.includes('thread')) {
    result = {...result, thread: responseData.thread};
  }
  if (require.includes('page')) {
    result = {...result, page: responseData.page};
  }
  if (require.includes('forum')) {
    result = {...result, forum: responseData.forum};
  }
  if (require.includes('counter')) {
    result = {...result,
      emojicounter, emoticonCounter, userAttributesCount: countUserAttributes(responseData.userList)};
  }
  if (require.includes('plainText')) {
    let contentList = postList.map(post => post.content);
    if (params.hasOwnProperty('withComment')) {
      contentList = contentList.concat(postList.map(post => post.subPostList.map(subPost => subPost.content)).flat());}
    result = {...result, contentList};
  }
  if (require.includes('timeLine')) {
    let timeLine = postList.map(post => post.time);
    timeLine.unshift(responseData.thread.createTime);
    if (params.hasOwnProperty('withComment')) {
      timeLine = timeLine.concat(postList.map(post => post.subPostList.map(subPost => subPost.time)).flat());}
    timeLine.sort((a, b) => a - b);
    result = {...result, timeLine};
  }
  return result;
}







user.get('/getPost', async (c) => {
  const time = new Date().getTime();
  let params  = c.req.query()
  let toResponse = {};
  toResponse.result = await getPost(params);
  toResponse.cost = new Date().getTime() - time;
  if (toResponse.result == null) {
    return c.json(toResponse, 404);
  }
  toResponse.length =  toResponse.result.postList.length;
  return c.json(toResponse);
})

export default user;