import {Hono} from "hono/quick";

import {postReqSerialize, postResDeserialize} from "../ProtobufParser.mjs";
import {postProtobuf, unpackPost} from "../utils.mjs";

const user = new Hono()

user.get('/', (c) => c.text('List users')) // GET /user

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
    temp = temp.flat()
    console.log(temp)
    const allPosts = temp.map(item => item.postList).reduce((acc, val) => acc.concat(val), []);
    const allUsers = temp.map(item => item.userList).reduce((acc, val) => acc.concat(val), []);
    responseData.postList.push(...allPosts);
    responseData.userList.push(...allUsers);
  }
  if (params.hasOwnProperty('raw')) {
    return c.json(responseData);
  }
  const [postList, emojicounter, emoticonCounter] = await unpackPost(responseData.postList);
  delete responseData.page;
  return c.json({result: {...responseData, postList, emojicounter, emoticonCounter}, cost: new Date().getTime() - time, length: responseData.postList.length});
})

export default user;