import {Hono} from "hono/quick";

import {postReqSerialize, postResDeserialize} from "../ProtobufParser.mjs";
import {baseUrl, packRequest, postFormData, postProtobuf, unpack} from "../utils.mjs";

const user = new Hono()

user.get('/', (c) => c.text('List users')) // GET /user

user.get('/:id', async (c) => {
  const id = c.req.param('id')
  const res = await fetch(baseUrl + `/i/sys/user_json?un=${id}&ie=utf-8`);
  const json = await res.json();
  return c.json(json)
})

user.post('/follows', async (c) => {
  const data = await c.req.formData();
  const res = await postFormData('/c/u/follow/followList', packRequest(data));
  return c.json(res)
})

user.post('/fans', async (c) => {
  const data = await c.req.formData();
  const res = await postFormData('/c/u/fans/page', packRequest(data));
  return c.json(res)
})

user.post('/forum', async (c) => {
  const data = await c.req.formData();
  const res = await postFormData('/c/f/forum/like', packRequest(data));
  return c.json(res)
})

user.post('/posts', async (c) => {
  const params = await c.req.formData();
  const buffer = await postReqSerialize(params.get('uid'), params.get('page'));
  const res = await postProtobuf('/c/u/feed/userpost?cmd=303002', buffer);
  if (res.byteLength < 200) {
    return c.json({});
  }
  const responseData = await postResDeserialize(res);
  if (params.get('compact')) {
    const unpackedJson = await unpack(responseData, params.get('needForumName'));
    return c.json(unpackedJson)
  }
  return c.json(responseData)
})

export default user;