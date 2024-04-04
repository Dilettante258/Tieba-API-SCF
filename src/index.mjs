import {serve} from '@hono/node-server'
import {Hono} from 'hono/quick'
import {forumReqSerialize, forumResDeserialize, postReqSerialize, postResDeserialize} from "./ProtobufParser.mjs";





const app = new Hono()

import user from "./routes/user.mjs";
import forum from "./routes/forum.mjs";


app.route('/user', user)
app.route('/forum', forum)

app.get('/', (c) => c.text('Tieba-Api-Huawei-FunctionGraph'))

app.notFound((c) => {
  return c.text('Custom 404 Message', 404)
})

app.onError((err, c) => {
  console.error(`${err}`)
  return c.text(`Custom Error Message ${err}`, 500)
})


const port = 8000
console.log(`Server running at http://localhost:${port}`)
serve({
  fetch: app.fetch,
  port
})
