import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'

import { swaggerUI } from '@hono/swagger-ui'
import user from "./routes/user.js";
import {OpenAPIHono} from "@hono/zod-openapi";
import {commonErrorHook} from "./utils/error.js";
import { apiReference } from '@scalar/hono-api-reference';




const app = new OpenAPIHono({defaultHook: commonErrorHook})


app.all(
  '*',
  cors({
    origin: ['http://localhost:3000','https://tieba.baidu.com'],
    // allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    // exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
    maxAge: 600,
    credentials: true,
  })
)

app.get('/ui', swaggerUI({ url: '/doc' }))
app.get(
  '/reference',
  apiReference({
    pageTitle: 'Tieba.js API Reference',
    spec: {
      url: '/doc',
    },
  }),
)
app.route('/', user)
// app.onError((err, c) => {
//   console.error(`${err}`)
//   if(err.name === 'NotFoundError') return c.json({error: err.message}, 500)
//   return c.json({error: '获取数据时发生内部错误'}, 500)
// })

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'My API',
  },
})

const port = 3001
console.log(`Server is running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
