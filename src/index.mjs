import {serve} from '@hono/node-server'
import {Hono} from 'hono/quick'
import { cors } from 'hono/cors'
import { rateLimiter } from "hono-rate-limiter"

const app = new Hono()

app.use('*', cors())

// 全局请求速率限制
const limiter = rateLimiter({
  // 5 minutes
  windowMs: process.env.SCF_REQUEST_LIMIT_WINDOW || 5 * 60 * 1000, 
  // Limit each IP to 100 requests per `window` (here, per 5 minutes).
  limit: process.env.SCF_REQUEST_LIMIT || 100, 
  // draft-6: `RateLimit-*` headers; draft-7: combined `RateLimit` header
  standardHeaders: "draft-6", 
  // 唯一key，用于标识一类需要限制的请求。这里写死了，所以所有请求都会被限制
  keyGenerator: (c) => "global", 
})

// Apply the rate limiting middleware to all requests.
app.use(limiter)

import user from "./routes/user.mjs";
import forum from "./routes/forum.mjs";
import post from "./routes/post.mjs";
import {Document} from "./web.mjs";


app.route('/user', user)
app.route('/forum', forum)
app.route('/post', post)

app.get('/', (c) => { return c.html(Document) })

app.get('/wakeup', (c) => {return c.text('OK!')})

app.notFound((c) => {
  return c.text('Custom 404 Message', 404)
})

app.onError((err, c) => {
  console.error(`${err}`)
  return c.text(`Custom Error Message ${err}`, 500)
})

console.log(`Server running at http://localhost:8000`)
serve({
  fetch: app.fetch,
  port: 8000
})
