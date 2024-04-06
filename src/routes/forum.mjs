import {Hono} from "hono/quick";

import {forumReqSerialize, forumResDeserialize} from "../ProtobufParser.mjs";
import {getForumName, postProtobuf} from "../utils.mjs";

const forum = new Hono()

forum.get('/getName',  async (c) => {
  const params  = c.req.query();
  const fname = await getForumName(params.get('fid'))
  return c.text(fname)
})

export default forum;