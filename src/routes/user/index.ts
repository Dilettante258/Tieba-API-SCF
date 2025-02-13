import {
  condenseProfile, getFan, getFollow,
  getHiddenLikeForum,
  getLikeForum,
  getPanel,
  getProfile,
  getUserInfo,
  getUserPost, type UserPost
} from "tieba.js";
import {getParams, methodEnum, type UpdateProperty} from "../../utils/format.js";

import {createRoute, OpenAPIHono} from '@hono/zod-openapi'
import {
  getUserInfoParamsSchema,
  userCondenseProfileSchema, userFanSchema, userFollowSchema, userHiddenLikeForumSchema,
  UserInfoSchema, userLikeForumSchema,
  UserPostSchema
} from "./schema.js";
import {commonErrorHook} from "../../utils/error.js";
import {errorMessageSchema, methodSpecSchema, methodWithPageSchema} from "../commonSchema.js";




const UserRoute = new OpenAPIHono({defaultHook: commonErrorHook});

const getUserInfoRoute = createRoute({
  method: 'get',
  path: '/info/{username}',
  tags: ['用户(User)'],
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

UserRoute.openapi(getUserInfoRoute, async (c) => {
  const { username } = c.req.valid('param')
  const res = await getUserInfo(username);
  return c.json(res)
})

const getUserPostRoute = createRoute({
  method: 'get',
  path: '/posts',
  tags: ['用户(User)'],
  request: {
    query: methodWithPageSchema,
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
    404: {
      content: {
        'application/json': {
          schema: errorMessageSchema,
        },
      },
      description: '用户隐藏发言时，返回404错误。',
    },
  },
})


UserRoute.openapi(getUserPostRoute, async (c) => {
  const { method, id, page } = c.req.valid('query')
  const user_id= await getParams(method, id, methodEnum.id) as number;
  try {
    const res = await getUserPost(user_id, Number(page), true) as UpdateProperty<UserPost, 'createTime', string>[];
    return c.json(res, 200)
  } catch (e: any) {
    return c.json({
      error: e.message,
      stack: e.stack
    },404)
  }
})

const getProfileRoute = createRoute({
  method: 'get',
  path: '/profile',
  tags: ['用户(User)'],
  request: {
    query: methodSpecSchema,
  },
  responses: {
    200: {
      description: '获取用户的发言记录',
    },
  },
})

UserRoute.openapi(getProfileRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const user_id= await getParams(method, id, methodEnum.id) as number;
  const res = await getProfile(user_id);
  return c.json(res)
})

const getPanelRoute = createRoute({
  method: 'get',
  path: '/panel',
  tags: ['用户(User)'],
  request: {
    query: methodSpecSchema,
  },
  responses: {
    200: {
      description: '获取用户的个人资料',
    },
  },
})

UserRoute.openapi(getPanelRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const un= await getParams(method, id, methodEnum.un) as string;
  const res = await getPanel(un);
  return c.json(res)
})

const getLikeForumRoute = createRoute({
  method: 'get',
  path: '/likeForum',
  tags: ['用户(User)'],
  request: {
    query: methodSpecSchema,
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

UserRoute.openapi(getLikeForumRoute, async (c) => {
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
  tags: ['用户(User)'],
  request: {
    query: methodSpecSchema,
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

// @ts-ignore
UserRoute.openapi(getCondenseProfileRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const user_id= await getParams(method,id, methodEnum.id) as number;
  const res = await condenseProfile(user_id)
  return c.json(res)
})

const getFollowRoute = createRoute({
  method: 'get',
  path: '/follow',
  tags: ['用户(User)'],
  request: {
    query: methodSpecSchema,
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


UserRoute.openapi(getFollowRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const user_id= await getParams(method, id, methodEnum.id) as number;
  const res = await getFollow(user_id, "needAll")
  return c.json(res)
})

const getFanRoute = createRoute({
  method: 'get',
  path: '/fan',
  tags: ['用户(User)'],
  request: {
    query: methodSpecSchema,
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


// @ts-ignore
UserRoute.openapi(getFanRoute, async (c) => {
  const { method, id } = c.req.valid('query')
  const user_id= await getParams(method, id, methodEnum.id) as number;
  const res = await getFan(user_id)
  return c.json(res)
})


export default UserRoute;
