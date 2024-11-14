import {Hono} from "hono";
import {getInfo, GetUserByUid} from "../../../../../../Repository/tieba.js/dist/User.js";
import {getUserPost} from "../../../../../../Repository/tieba.js/src/UserPost.js";


const user = new Hono().basePath('/user')

user.get('/', (c) => c.text('List Users'))

user.get('/info/:username', async (c) => {
  const username = c.req.param('username');
  try {
    const res = await getInfo(username);
    return c.json(res)
  }
  catch (e) {
    return c.text('User not found', 404)
  }
})

user.get('/posts', async (c) => {
  let user_id = 0;
  const uid = c.req.query('uid');
  const id = c.req.query('id')
  const username = c.req.query('name')
  const page = Number(c.req.query('page'))
  if(username){
    user_id = Number(uid);
    const userdata = await getInfo(username);
    user_id = userdata.id;
  } else if(uid) {
    user_id = Number(uid);
  } else if(id) {
    try {
      const userdata = await GetUserByUid(Number(id))
      user_id = Number(userdata.id)
      console.log(user_id)
    } catch (e) {
      return c.text('用户不存在', 404)
    }
  }
  try {
    if(Number.isInteger(page)) {
      const res = await getUserPost(user_id, page);
      return c.json(res)
    }
  }
  catch (e) {
    return c.text('用户不存在', 404)
  }
})

export default user;
