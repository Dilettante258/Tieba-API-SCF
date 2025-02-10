import {serve} from '@hono/node-server'
import {cors} from 'hono/cors'
import UserRoute from "./routes/user/index.js";
import {OpenAPIHono} from "@hono/zod-openapi";
import {commonErrorHook} from "./utils/error.js";
import {apiReference} from '@scalar/hono-api-reference';
import PostRoute from "./routes/post/index.js";
import ForumRoute from "./routes/forum/index.js";


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

app.get(
  '/reference',
  apiReference({
    pageTitle: 'Tieba.js API Reference',
    spec: {
      url: '/doc',
    },
  }),
)
app.route('/user', UserRoute)
app.route('/post', PostRoute)
app.route('/forum', ForumRoute)


// app.onError((err, c) => {
//   console.error(`${err}`)
//   if(err.name === 'NotFoundError') return c.json({error: err.message}, 500)
//   return c.json({error: '获取数据时发生内部错误'}, 500)
// })

const terms = '注意事项：使用此库时请仅用于学习和测试，禁止用于非法用途及其他恶劣的社区行为如：恶意刷屏、辱骂黄暴、各种形式的滥用等，违规此模块许可证 `GNU General Public License Version 3` 及此条注意事项而**产生的任何后果自负，模块的所有贡献者不负任何责任**。'

app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    version: '1.0.0',
    title: 'Tieba.js API',
    description: `百度贴吧的一些常用API调用的转发封装。\n - ${terms}`,
    termsOfService: terms,
    contact: {
      name: 'Yuuka',
      url: 'https://github.com/Dilettante258/Tieba-API-SCF',
      email: 'yuuka67@outlook.com'
    },
    license: {
      name: 'GNU General Public License Version 3',
      url: 'https://www.gnu.org/licenses/gpl-3.0.en.html'
    }
  },
  servers: [
    {
      url: 'http://localhost:3001',
      description: '`Localhost` - **本地运行**时可选接口。',
    },
    {
      url: 'https://tieba.baidu.com',
      description: 'Tieba',
    },
  ],
  tags: [
    {
      name: '用户(User)',
      description: '用户相关的接口：包括 \n- 获取用户信息\n- 获取用户发言记录\n- 获取用户个人资料\n- 获取用户关注贴吧\n- 获取用户关注列表\n- 获取用户粉丝列表',
    },
    {
      name: '帖子(Post)',
      description: '帖子相关的接口：包括 \n- 获取帖子原始格式内容\n- 获取预处理后的帖子回复内容',
    },
    {
      name: '吧(Forum)',
      description: '吧相关的接口：包括 \n- 获取某吧的帖子推荐列表\n- 获取吧的关注成员列表',
    },
  ]
})

const port = 3001
console.log(`Server is running on http://localhost:${port}`)

serve({
  fetch: app.fetch,
  port
})
