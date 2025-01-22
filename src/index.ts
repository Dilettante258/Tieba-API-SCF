import { serve } from '@hono/node-server'
import { cors } from 'hono/cors'
import { Hono } from 'hono'
import user from "./routes/user.js";



const app = new Hono()
app.all(
  '*',
  cors({
    origin: ['http://localhost:3000','https://tieba.baidu.com'],
    allowHeaders: ['X-Custom-Header', 'Upgrade-Insecure-Requests'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length', 'X-Kuma-Revision'],
    maxAge: 600,
    credentials: true,
  })
)
app.route('/', user)
app.onError((err, c) => {
  console.error(`${err}`)
  return c.json({error: '获取数据时发生内部错误'}, 500)
})

const port = 3001
console.log(`Server is running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
