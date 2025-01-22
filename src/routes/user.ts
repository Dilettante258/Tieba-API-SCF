import {Hono} from "hono";
import {getLikeForum, getPanel, getProfile, getUserInfo} from "tieba.js";
import {getUserPost} from "tieba.js";
import {getParams} from "../utils/format.js";


const user = new Hono().basePath('/user')

// ToDo: 加入自定义错误

user.get('/', (c) => c.text('List Users'))

user.get('/info/:username', async (c) => {
  const username = c.req.param('username');
  const res = await getUserInfo(username);
  return c.json(res)
})

user.get('/posts', async (c) => {
  const user_id= await getParams(c.req, 1) as number;
  const page = Number(c.req.query('page'));
  if(user_id===0){
    c.json({error: '用户不存在'}, 404)
  }
  const res = await getUserPost(user_id, page);
  return c.json(res)
})

user.get('/profile', async (c) => {
  const user_id= await getParams(c.req, 1) as number;
  if(user_id===0){
    c.json({error: '用户不存在'}, 404)
  }
  const res = await getProfile(user_id);
  return c.json(res)
})

user.get('/panel', async (c) => {
  const un= await getParams(c.req, 2) as string;
  if(un===""){
    c.json({error: '用户不存在'}, 404)
  }
  const res = await getPanel(un);
  return c.json(res)
})

user.get('/likeForum', async (c) => {
  const user_id= await getParams(c.req, 1) as number;
  if(user_id===0){
    c.json({error: '用户不存在'}, 404)
  }
  const res = await getLikeForum(user_id, "needAll");
  return c.json(res)
})




export default user;
