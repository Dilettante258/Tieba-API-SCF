import {Hono} from "hono/quick";

import {getForumName} from "../utils.mjs";

const forum = new Hono()

forum.get('/getName',  async (c) => {
  const params  = c.req.query();
  const fname = await getForumName(params['fid']);
  return c.text(fname)
})

export default forum;