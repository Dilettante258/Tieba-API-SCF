import {Hono} from "hono/quick";

import {userPostReqSerialize, userPostResDeserialize} from "../ProtobufParser.mjs";
import {baseUrl, packRequest, postFormData, postProtobuf, unpack, unpackSimpleUserPost} from "../utils.mjs";

const user = new Hono()

user.get('/', (c) => c.text('List users')) // GET /user

user.get('/getinfo/:username', async (c) => {
  const username = c.req.param('username');
  const res = await fetch(baseUrl + `/i/sys/user_json?un=${username}&ie=utf-8`);
  try {
    const json = await res.json();
    return c.json(json)
  }
  catch (e) {
    return c.text('User not found', 404)
  }
})



user.get('/fans', async (c) => {
  let params  = c.req.query()
  let res = await postFormData('/c/u/fans/page', packRequest(params));
  if (params.hasOwnProperty('needAll') && res.page.total_page !== '1') {
    for (let i = 2; i <= Number(res.page.total_page); i++) {
      params.pn = i.toString();
      let temp = await postFormData('/c/u/fans/page', packRequest(params));
      res.user_list.push(...temp.user_list);
    }
  }
  return c.json(res)
})

user.get('/related', async (c) => {
  let params  = c.req.query()
  let res = await postFormData('/c/u/fans/page', packRequest(params));
  let friend = 0;
  let followed = 0;
  let fans = 0;

  if (params.hasOwnProperty('needAll') && res.page.total_page !== '1') {
    for (let i = 2; i <= Number(res.page.total_page); i++) {
      params.pn = i.toString();
      let temp = await postFormData('/c/u/fans/page', packRequest(params));
      res.user_list.push(...temp.user_list);
    }
  }
  console.log(res.user_list);

  res.user_list = res.user_list.filter(item => {
    if (item.is_friend !== '0') {
      friend++;
    }
    if (item.is_followed !== '0') {
      followed++;
    }
    if (item.is_fans !== '0') {
      fans++;
    }
    return item.is_friend !== '0' || item.is_followed !== '0' || item.is_fans !== '0';
  });

  res.statistics = {
    friend,
    followed,
    fans
  };

  return c.json(res)
})

user.get('/follows', async (c) => {
  let params  = c.req.query()
  let res = await postFormData('/c/u/follow/followList', packRequest(params));
  if (params.hasOwnProperty('needAll') && res.total_follow_num !== 1) {
    const promises = [];
    for (let i = 2; i <= (res.total_follow_num/20+1); i++) {
      params.pn = i.toString();
      promises.push(postFormData('/c/u/follow/followList', packRequest(params)));
    }
    const results = await Promise.all(promises);
    results.forEach(result => {
      res.follow_list.push(...result.follow_list);
    });
  }
  return c.json(res)
})

user.get('/forum', async (c) => {
  let params  = c.req.query()
  if (!params['page_no']) {
    params['page_no'] = 1;
  }
  if (!params['page_size']) {
    params['page_size'] = 400;
  }
  const res = await postFormData('/c/f/forum/like', packRequest(params));
  if (!params.hasOwnProperty('raw')) {
    if (res?.forum_list?.gconforum) {
      return c.json(res?.forum_list['non-gconforum']?.concat(res?.forum_list?.gconforum));
    }
    return c.json(res?.forum_list ? res?.forum_list['non-gconforum'] : []);
  }
  return c.json(res)
})

user.get('/posts', async (c) => {
  const time = new Date().getTime();
  let params  = c.req.query()
  let responseData;
  if (params.hasOwnProperty('batch')) {
    const promises = [];
    const [from,to] =  params['batch'].split(',');
    for (let i = Number(from); i <= Number(to); i++) {
      promises.push(userPostReqSerialize(params['uid'], i));
    }
    const buffers = await Promise.all(promises);
    const results = await Promise.all(buffers.map(buffer => postProtobuf('/c/u/feed/userpost?cmd=303002', buffer)));
    responseData = await Promise.all(results.map(res => userPostResDeserialize(res)));
    responseData = responseData.flat()
  } else {
    const buffer = await userPostReqSerialize(params['uid'], params['page'] || 1);
    const res = await postProtobuf('/c/u/feed/userpost?cmd=303002', buffer);
    if (res.byteLength < 200) {
      return c.json({
        "code": 0,
        "data": {
          "postList": [],
          "hasMore": false
        }
      }, 404);
    }
    responseData = await userPostResDeserialize(res);
  }
  if (params.hasOwnProperty('raw')) {
    return c.json(responseData);
  }
  if (params.hasOwnProperty('simple')) {
    const unpackedJson = await unpackSimpleUserPost(responseData);
    return c.json({result:unpackedJson, cost: new Date().getTime() - time, length: unpackedJson.length});
  }
  const unpackedJson = await unpack(responseData, params.hasOwnProperty('needForumName'));
  return c.json({result:unpackedJson, cost: new Date().getTime() - time, length: unpackedJson.length});
})

export default user;