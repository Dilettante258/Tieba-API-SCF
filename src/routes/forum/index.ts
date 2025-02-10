import {getForumMembers, getThread, getThreadPid} from "tieba.js";
import {createRoute, OpenAPIHono} from '@hono/zod-openapi'
import {commonErrorHook} from "../../utils/error.js";
import {
  fnameSchema,
  forumMemberResSchema,
  forumThreadPidResSchema,
  forumThreadResSchema,
  threadFetchSchema
} from "./schema.js";


const ForumRoute = new OpenAPIHono({defaultHook: commonErrorHook});

const getForumMemberRoute = createRoute({
  method: 'get',
  path: '/member',
  tags: ['吧(Forum)'],
  description: "获取吧会员列表。",
  request: {
    query: fnameSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: forumMemberResSchema,
        },
      },
      description: '吧会员列表。',
    },
  },
})

ForumRoute.openapi(getForumMemberRoute, async (c) => {
  const { fname, page } = c.req.valid('query')
  const data = await getForumMembers(fname, Number(page));
  return c.json(data)
})

const getThreadRoute = createRoute({
  method: 'get',
  path: '/thread',
  tags: ['吧(Forum)'],
  description: "获取某吧的帖子推荐列表。",
  request: {
    query: threadFetchSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: forumThreadResSchema,
        },
      },
      description: '主题帖列表。',
    },
  },
})

// @ts-ignore
ForumRoute.openapi(getThreadRoute, async (c) => {
  const { fname, page, sort, onlyGood } = c.req.valid('query')
  const data = await getThread({
    fname,
    page: Number(page),
    rn: 30,
    // @ts-ignore
    sort: sort||1,
    OnlyGood: onlyGood,
  });
  return c.json(data)
})

const getThreadPidRoute = createRoute({
  method: 'get',
  path: '/thread-pid',
  tags: ['吧(Forum)'],
  description: "获取某吧的帖子推荐列表。(仅获取主题帖Pid号）",
  request: {
    query: threadFetchSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: forumThreadPidResSchema,
        },
      },
      description: '主题帖Pid号列表。',
    },
  },
})

ForumRoute.openapi(getThreadPidRoute, async (c) => {
  const { fname, page } = c.req.valid('query')
  const data = await getThreadPid({
    fname,
    page: Number(page),
    rn: 30,
    sort: 1,
    OnlyGood: false,
  });
  return c.json(data)
})


export default ForumRoute;
