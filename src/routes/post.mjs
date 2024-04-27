import {Hono} from "hono/quick";

import {postReqSerialize, postResDeserialize} from "../ProtobufParser.mjs";
import {postProtobuf, unpackPost, countUserAttributes} from "../utils.mjs";

const user = new Hono()

user.get('/', (c) => c.text('Post Api')) // GET /user

user.get('/getPost', async (c) => {
  const time = new Date().getTime();
  let params  = c.req.query()
  let responseData;
  const buffer = await postReqSerialize(params);
    const res = await postProtobuf('/c/f/pb/page?cmd=303002', buffer);
    if (res.byteLength < 200) {
      return c.json({
        "code": 404,
        "data": []
      }, 404);
    }
  responseData = await postResDeserialize(res);
  if (params.hasOwnProperty('needAll') && responseData.page.totalPage !== '1') {
    const promises = [];
    for (let i = 2; i <= Number(responseData.page.totalPage); i++) {
      params.page = i.toString();
      promises.push(postReqSerialize(params));
    }
    const buffers = await Promise.all(promises);
    const results = await Promise.all(buffers.map(buffer => postProtobuf('/c/f/pb/page?cmd=303002', buffer)));
    let temp = await Promise.all(results.map(res => postResDeserialize(res)));
    temp = temp.flat();
    const allPosts = temp.map(item => item.postList).reduce((acc, val) => acc.concat(val), []);
    const allUsers = temp.map(item => item.userList).reduce((acc, val) => acc.concat(val), []);
    responseData.postList.push(...allPosts);
    responseData.userList.push(...allUsers);
  }

  let toResponse = { result: {} }
  if (params.hasOwnProperty('raw')) {
    return c.json(responseData);
  }
  if (!params.hasOwnProperty('require')) { params['require'] = 'postList,thread,forum,counter,timeLine,withComment'; }
  const require = params.require.split(',');
  const [postList, emojicounter, emoticonCounter] = await unpackPost(responseData.postList, require.includes('plainText'), params.hasOwnProperty('withComment'));
  if (require.includes('postList')) {
    toResponse.result = {...toResponse.result, postList};
  }
  if (require.includes('userList')) {
    toResponse.result = {...toResponse.result, userList: responseData.userList};
  }
  if (require.includes('thread')) {
    toResponse.result = {...toResponse.result, thread: responseData.thread};
  }
  if (require.includes('forum')) {
    toResponse.result = {...toResponse.result, forum: responseData.forum};
  }
  if (require.includes('counter')) {
    toResponse.result = {...toResponse.result,
      emojicounter, emoticonCounter, userAttributesCount: countUserAttributes(responseData.userList)};
  }
  if (require.includes('plainText')) {
    let contentList = postList.map(post => post.content);
    if (params.hasOwnProperty('withComment')) {
      contentList = contentList.concat(postList.map(post => post.subPostList.map(subPost => subPost.content)).flat());}
    toResponse.result = {...toResponse.result, contentList};
  }
  if (require.includes('timeLine')) {
    let timeLine = postList.map(post => post.time);
    timeLine.unshift(responseData.thread.createTime);
    if (params.hasOwnProperty('withComment')) {
      timeLine = timeLine.concat(postList.map(post => post.subPostList.map(subPost => subPost.time)).flat());}
    timeLine.sort((a, b) => a - b);
    toResponse.result = {...toResponse.result, timeLine};
  }
  toResponse.cost = new Date().getTime() - time;
  toResponse.length =  responseData.postList.length;
  return c.json(toResponse);
})

export default user;