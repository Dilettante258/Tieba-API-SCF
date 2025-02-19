import {type HonoRequest} from "hono";
import {getProfile, getUnameFromId, getUserByUid, getUserInfo} from "tieba.js";

export function formatPage(text: string|undefined) {
  const temp = Number(text)
  if (Number.isInteger(temp) && temp > 0) {
    return temp
  } else {
    return 1
  }
}

export const enum methodEnum {
  uid ='uid',
  id = 'id',
  un = 'un'
}

export type UpdateProperty<T, K extends keyof T, V> = Omit<T, K> & {
  [P in K]: V;
};

class DisabledError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DisabledError";
  }
}

class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

// 该函数的大部分分支均未进行测试！
export async function getParams(method: keyof typeof methodEnum, id: string, need: methodEnum): Promise<number|string> {
  let result = 0;
  const un2id = async (un: string) => getUserInfo(un).then((res) => res.id);
  const id2uid = async (id: string) => getProfile(Number(id)).then((res) => Number(res.user.tiebaUid));
  switch (need) {
    case methodEnum.uid:
      if(method===methodEnum.uid){
        result = Number(id);
      } else if(method===methodEnum.un) {
        const id_ = await un2id(id);
        result = await id2uid(id_);
      } else if(id) {
        result = await id2uid(id);
      }
      if(result === 0) throw new NotFoundError("未找到用户");
      return result;
    case methodEnum.id:
      if(method===methodEnum.id){
        return Number(id);
      } else if(method===methodEnum.un) {
        result = await un2id(id);
      } else if(method===methodEnum.uid) {
        const userdata = await getUserByUid(Number(id))
        if(!userdata) throw new NotFoundError("未找到用户");
        result = Number(userdata?.id)
      }
      if(result === 0) throw new NotFoundError("未找到用户");
      return result;
    case methodEnum.un:
      if(method===methodEnum.un){
        return id;
      } else if(method===methodEnum.uid) {
        const userdata = await getUserByUid(Number(id))
        return userdata?.name;
      } else if(method===methodEnum.id) {
        return await getUnameFromId(Number(id));
      }
      throw new NotFoundError("用户不存在");
  }
}
