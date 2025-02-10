import {collatePost, getPost} from "tieba.js";
import {createRoute, OpenAPIHono} from '@hono/zod-openapi'
import {commonErrorHook} from "../../utils/error.js";
import {postDataSchema, tidSchema} from "./schema.js";


const PostRoute = new OpenAPIHono({defaultHook: commonErrorHook});


const getRawPostRoute = createRoute({
  method: 'get',
  path: '/raw',
  tags: ['帖子(Post)'],
  description: "获取某一个主题帖下的回复内容,原始格式，不作处理。因为复杂不提供格式示例。",
  request: {
    query: tidSchema,
  },
  responses: {
    200: {
      description: '获取某一个主题帖下的回复内容,原始格式，不作处理。因为复杂不提供格式示例。',
    },
  },
})

PostRoute.openapi(getRawPostRoute, async (c) => {
  const { tid, page } = c.req.valid('query')
  const data = await getPost(Number(tid), page === "ALL" ? page : Number(page),false,true);
  return c.json(data)
})

const getPostRoute = createRoute({
  method: 'get',
  path: '/pretty',
  tags: ['帖子(Post)'],
  description: "将content内容处理为纯文本格式的回复内容。",
  request: {
    query: tidSchema,
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: postDataSchema,
        }
      },
      description: '获取某一个主题帖下的回复内容。',
    },
  },
})

// @ts-ignore
PostRoute.openapi(getPostRoute, async (c) => {
  const { tid, page } = c.req.valid('query')
  const data = await getPost(Number(tid), page === "ALL" ? page : Number(page), false, true);
  const postData = collatePost(data.postList)
  return c.json({
    ...data,
    postList: postData
  })
})




export default PostRoute;
