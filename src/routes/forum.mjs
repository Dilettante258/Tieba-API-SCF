import {Hono} from "hono/quick";

import {forumReqSerialize, forumResDeserialize} from "../ProtobufParser.mjs";
import {postProtobuf} from "../utils.mjs";

const forum = new Hono()

forum.post('/getName',  async (c) => {
  const params = await c.req.formData();
  const buffer = await forumReqSerialize(params.get('fid'));
  const res = await postProtobuf('/c/f/forum/getforumdetail?cmd=303021', buffer);
  if (res.byteLength < 200) {
    return c.text("error");
  }
  const fname = await forumResDeserialize(res);
  return c.text(fname)
})

export default forum;