import {
  condenseProfile, getFan, getFollow,
  getHiddenLikeForum,
  getLikeForum,
  getPanel,
  getProfile,
  getUserInfo,
  getUserPost, type UserPost
} from "tieba.js";
import {getParams, methodEnum, type UpdateProperty} from "../utils/format.js";

import {createRoute, OpenAPIHono} from '@hono/zod-openapi'
import {
  getUserInfoParamsSchema,
  ParamsSchema,
  ParamsWithPageSchema, userCondenseProfileSchema, userFanSchema, userFollowSchema, userHiddenLikeForumSchema,
  UserInfoSchema, userLikeForumSchema,
  UserPostSchema
} from "./user/schema.js";
import {commonErrorHook} from "../utils/error.js";



const user = new OpenAPIHono({defaultHook: commonErrorHook}).basePath('/user');

const getUserInfoRoute = createRoute({
  method: 'get',
  path: '/info/{username}',
  request: {
    params: getUserInfoParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UserInfoSchema,
        },
      },
      description: 'Retrieve the user',
    },
  },
})

user.openapi(getUserInfoRoute, async (c) => {
  const { username } = c.req.valid('param')
  const res = await getUserInfo(username);
  return c.json(res)
})

const getUserPostRoute = createRoute({
  method: 'get',
  path: '/posts',
  request: {
    query: ParamsWithPageSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: UserPostSchema,
        },
      },
      description: '获取用户的发言记录',
    },
  },
})

user.openapi(getUserPostRoute, async (c) => {
  const { method, id, page } = c.req.valid('query')
  const user_id= await getParams(method, id, methodEnum.id) as number;
  const res = await getUserPost(user_id, Number(page)) as UpdateProperty<UserPost, 'createTime', string>[];
  return c.json(res)
})

const getProfileRoute = createRoute({
  method: 'get',
  path: '/profile',
  request: {
    query: ParamsSchema,
  },
  responses: {
    200: {
      description: '获取用户的发言记录',
    },
  },
})

user.openapi(getProfileRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const user_id= await getParams(method, id, methodEnum.id) as number;
  const res = await getProfile(user_id);
  return c.json(res)
})

const getPanelRoute = createRoute({
  method: 'get',
  path: '/panel',
  request: {
    query: ParamsSchema,
  },
  responses: {
    200: {
      description: '获取用户的个人资料',
    },
  },
})

user.openapi(getPanelRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const un= await getParams(method, id, methodEnum.un) as string;
  const res = await getPanel(un);
  return c.json(res)
})

const getLikeForumRoute = createRoute({
  method: 'get',
  path: '/likeForum',
  request: {
    query: ParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: userLikeForumSchema,
        }
      },
      description: '获取用户关注贴吧的列表，当用户隐藏时，不可获取。',
    },
    206: {
      content: {
        'application/json': {
          schema: userHiddenLikeForumSchema,
        }
      },
      description: '用户隐藏关注贴吧时，从其他方法获取到的部分关注贴吧。',
    }
  },
})

user.openapi(getLikeForumRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const user_id = await getParams(method, id, methodEnum.id) as number;

  const res = await getLikeForum(user_id, "needAll");
  if (res.length === 0) {
    const data = await getHiddenLikeForum(user_id)
    return c.json(data, 206)
  }
  return c.json(res, 200)
})

const getCondenseProfileRoute = createRoute({
  method: 'get',
  path: '/condenseProfile',
  request: {
    query: ParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: userCondenseProfileSchema,
        }
      },
      description: '获取用户关注贴吧的列表，当用户隐藏时，不可获取。',
    },
  },
})

user.openapi(getCondenseProfileRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const user_id= await getParams(method,id, methodEnum.id) as number;
  const res = await condenseProfile(user_id)
  return c.json(res)
})

const getFollowRoute = createRoute({
  method: 'get',
  path: '/follow',
  request: {
    query: ParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: userFollowSchema,
        }
      },
      description: '用户的关注列表',
    },
  },
})

user.openapi(getFollowRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const user_id= await getParams(method, id, methodEnum.id) as number;
  const res = await getFollow(user_id, "needAll")
  return c.json(res)
})

const getFanRoute = createRoute({
  method: 'get',
  path: '/fan',
  request: {
    query: ParamsSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: userFanSchema,
        }
      },
      description: '用户的粉丝列表',
    },
  },
})

user.openapi(getFanRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const user_id= await getParams(method, id, methodEnum.id) as number;
  const res = await getFan(user_id)
  return c.json(res)
})


export default user;
