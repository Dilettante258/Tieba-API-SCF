import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import user from "./routes/user.js";

const book = new Hono()
book.get('/book', (c) => c.text('List Books')) // GET /book
book.post('/book', (c) => c.text('Create Book')) // POST /book



const app = new Hono()
app.route('/', book) // Handle /book
app.route('/', user)

const port = 3000
console.log(`Server is running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
