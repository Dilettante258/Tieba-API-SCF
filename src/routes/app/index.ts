import {createRoute, OpenAPIHono} from "@hono/zod-openapi";
import {getUserInfoParamsSchema, UserInfoSchema} from "../user/schema.js";
import {getUserInfo} from "tieba.js";

import {
  getCookie,
  getSignedCookie,
  setCookie,
  setSignedCookie,
  deleteCookie,
} from 'hono/cookie'
import {commonErrorHook} from "../../utils/error.js";
import ForumRoute from "../forum/index.js";
import {oAuthQuerySchema} from "./schema.js";

const AppRoute = new OpenAPIHono({defaultHook: commonErrorHook});

const loginRoute = createRoute({
  method: 'get',
  path: '/login',
  tags: ['App'],
  // request: {
  //   body:
  // },
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

AppRoute.openapi(loginRoute, async (c) => {
  // Regular cookies
  setCookie(c, 'great_cookie', 'banana', {
    path: '/',
    secure: true,
    domain: 'localhost',
    httpOnly: true,
    maxAge: 1000,
    expires: new Date(Date.UTC(2025, 11, 24, 10, 30, 59, 900)),
    sameSite: 'Strict',
  })
  return c.json({})
})

const oauthRoute = createRoute({
  method: 'get',
  path: '/oauth/redirect',
  tags: ['App'],
  request: {
    query: oAuthQuerySchema,
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

AppRoute.openapi(oauthRoute, async (c) => {
  const {code: requestToken} = c.req.valid('query');
  console.log(requestToken)
  if(process.env.clientID === undefined || process.env.clientSecret === undefined){
    return c.json({error: '没有配置clientID或clientSecret的环境变量！'})
  }
  const params = {
    client_id: process.env.clientID as string,
    client_secret: process.env.clientSecret as string,
    code: requestToken
  };
  console.log(params)
  const searchParams = new URLSearchParams(params);
  const tokenResponse = await fetch('https://github.com/login/oauth/access_token?' +
    searchParams.toString(), {
      method: 'POST',
      headers: {
        'Accept': 'application/json'
      }
    }).then((res)=> res.json())
  if(!tokenResponse.access_token){
    return c.json({error: '获取token失败'})
  }


  const data = await fetch('https://api.github.com/user',
    {
      headers: {
        'Authorization': `token ${tokenResponse.access_token}`
      }
    }).then((d)=> d.json())

  setCookie(c, 'great_cookie', 'banana', {
    path: '/',
    secure: true,
    domain: 'localhost',
    httpOnly: true,
    maxAge: 1000,
    expires: new Date(Date.UTC(2025, 11, 24, 10, 30, 59, 900)),
    sameSite: 'Strict',
  })
  return c.json(data)
})

export default AppRoute;
