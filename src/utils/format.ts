import {type HonoRequest} from "hono";
import {getUnameFromId, getUserByUid, getUserInfo} from "tieba.js";

export function formatPage(text: string|undefined) {
  const temp = Number(text)
  if (Number.isInteger(temp) && temp > 0) {
    return temp
  } else {
    return 1
  }
}

enum method {
  uid,
  id,
  un
}

export async function getParams(req: HonoRequest, need: method): Promise<number|string> {
  let result = 0;
  const uid = req.query('uid');
  const id = req.query('id')
  const username = req.query('un')
  const un2id = async (un: string) => getUserInfo(un).then((res) => res.id);
  switch (need) {
    case method.uid:
      if(uid){
        return Number(uid);
      } else if(username) {
        console.error("暂时不可实现")
        return 0;
      } else if(id) {
        console.error("暂时不可实现")
        return 0;
      }
      return result;
    case method.id:
      if(id){
        return Number(id);
      } else if(username) {
        result = await un2id(username);
      } else if(uid) {
        try {
          const userdata = await getUserByUid(Number(uid))
          result = Number(userdata.id)
        } catch (e) {
          console.error(e)
          return result;
        }
      }
      return result;
    case method.un:
      if(username){
        return username;
      } else if(uid) {
        try {
          const userdata = await getUserByUid(Number(uid))
          return userdata.name;
        } catch (e) {
          console.error(e)
          return "";
        }
      } else if(id) {
        return await getUnameFromId(Number(id));
      }
      return "";
  }
}
