import {serve} from '@hono/node-server'
import {Hono} from 'hono/quick'
import { cors } from 'hono/cors'

const app = new Hono()

app.use('*', cors())

import user from "./routes/user.mjs";
import forum from "./routes/forum.mjs";
import {Document} from "./web.mjs";


app.route('/user', user)
app.route('/forum', forum)

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
