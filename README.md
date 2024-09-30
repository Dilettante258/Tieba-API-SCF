```
npm install
npm run dev
```

open <http://localhost:8000> in your browser

这是一个部署在华为[函数工作流 FunctionGraph](https://www.huaweicloud.com/intl/zh-cn/product/functiongraph.html)上的贴吧API
封装实现，使用了[Hono](https://hono.dev/)框架。

SCF意指Serverless Cloud Function 云函数。

API使用参考： [Postman文档](https://documenter.getpostman.com/view/32034983/2sA3BuX9Nc)（施工中）

# 环境变量

- **SCF_REQUEST_LIMIT_WINDOW**: 请求频率窗口期，默认值为5分钟（300000ms）。示例值：1000（1秒）
- **SCF_REQUEST_LIMIT**: 请求窗口期内，最多全局请求数量，如果超过这个数量会返回429。默认值为100（100个请求）。示例值：1（1个请求）

# API

###  Forum

有关**吧**的API封装。

目前有：

- **getName**: `/forum/getName`
- **getThreads**: `/forum/getThreads`


#### getThreads

获取特定吧的推送帖子列表。

### 参数

以下参数越靠前，执行优先度越高。

| 参数名 | 含义 | 示例 | 说明 |
| --- | --- | --- | --- |
| fname | 吧名 | fname=v |  |
| batch | 批量获取从{from}页到{to}页的贴子 | batch=from,to | _仅合并threadList_, _userList，_取第一个 Res 对象中的 _forum_ 和 _thread_ 属性，取最后一个 Res 对象中的 _page_ 属属性 |
| page | 请求第几页的数据 | page=5 | 不填默认为1，**有batch参数时，此参数将会被忽略** |
| rn | 一页所含帖子数量 | rn=30 | 默认30，最大100 |
| OnlyGood | 是否只看精品贴 | OnlyGood=1 |  |
| sort | 请求贴子时的排序方式 | sort=1 | 对于有热门分区的贴吧 0热门排序 1按发布时间 2关注的人 34热门排序 >=5是按回复时间  <br>对于无热门分区的贴吧 0按回复时间(REPLY) 1按发布时间 2关注的人 >=3按回复时间 |
| raw | 直接返回反序列化后原始的json内容。 | raw=1(任何字符均可) |  |
| require | 经过简单预处理后，result包含的数据。 | require=threadList,forum | **有raw参数时，此参数将会被忽略**  <br>示例的result中将会只包含 threadList(简略贴子对象列表)、forum(查询的吧的简略信息)  <br>默认参数详见说明。 |

#### require参数的详细说明

有以下可行的枚举：

- `threadList`: 简略贴子对象列表
- `userList`: 当前发帖用户的列表（不含ip信息）
- `forum`: 查询的吧的简略信息
- `pidList`: `threadList`中的pid(贴编号)的列表
- `counter`: emoji计数器，贴吧表情计算器
- `plainText`: 可用于分词的纯文本，标题与内容拼接。(如果主楼过长，接口返回的数据仅含一部分)
- `timeLine`: 增序排序过后的的贴子列表中发贴时间的时间戳列表
