# Tieba API

面向贴吧数据查询与分析的 HTTP API 服务，基于 Hono + tieba.js。

## 这个项目的意义

贴吧原始接口使用门槛较高（协议复杂、字段分散、调用流程不统一）。
本项目将常用能力统一为标准 HTTP 接口，方便你直接接入前端、脚本、数据分析和自动化流程。

## 项目优势

- 数据获取接口全部是 `GET` 请求：便于浏览器、CDN、反向代理统一缓存。
- 内置 `Cache-Control`：默认按接口类型返回缓存策略，开箱即用。
- 支持多运行时：`Bun / Node / Cloudflare Worker`。
- 提供现成 Docker 镜像：可直接部署，无需本地构建。
- 提供 OpenAPI 文档：`/openapi.json` + `/docs`，方便调试和联调。
- 长任务使用 SSE：分析/导出接口支持流式进度回传。

## 快速开始

### 1) 直接用 Docker 镜像运行（推荐）

需要先准备 `BDUSS`（可通过在线工具获取：<https://bduss.nest.moe/>）。

国内镜像源（阿里云）：

```bash
docker run --rm -p 8000:8000 \
  -e BDUSS=你的BDUSS \
  crpi-visd77fbydeujidg.cn-hangzhou.personal.cr.aliyuncs.com/dilettante/tieba-api:latest
```

国外镜像源（GHCR，CI 自动构建）：

```bash
docker run --rm -p 8000:8000 \
  -e BDUSS=你的BDUSS \
  ghcr.io/dilettante258/tieba-api-scf:latest
```

启动后默认地址：`http://localhost:8000`

> 说明：当前发布的 Docker 镜像默认使用 **Node 运行时**，并由 GitHub Actions `ubuntu-latest` 构建，镜像架构为 **`linux/amd64`**。  
> 如果你希望使用 **Bun 运行时**，请使用仓库内的 `Dockerfile.bun` 自行构建镜像。

### 1.1) 本地构建 Docker 镜像

默认 `Dockerfile` 使用 Node 运行时构建（推荐）：

```bash
docker build -t tieba-api:node .
docker run --rm -p 8000:8000 -e BDUSS=你的BDUSS tieba-api:node
```

`Dockerfile.bun` 为 Bun 备用构建：

```bash
docker build -f Dockerfile.bun -t tieba-api:bun .
docker run --rm -p 8000:8000 -e BDUSS=你的BDUSS tieba-api:bun
```

### 2) 使用 Release 构建产物运行

Release 中提供：

- `api-bun-<sha>.tar.gz`
- `api-node-<sha>.tar.gz`

示例（`ac25449`）：

```bash
mkdir -p api-bun
tar -xzf api-bun-ac25449.tar.gz -C api-bun
BDUSS=你的BDUSS bun ./api-bun/index.js
```

```bash
mkdir -p api-node
tar -xzf api-node-ac25449.tar.gz -C api-node
BDUSS=你的BDUSS node ./api-node/index.js
```

## 环境变量

- `BDUSS`（必填）：贴吧鉴权凭据。
- `PORT`（可选）：服务端口，默认 `8000`。

## 文档与健康检查

- OpenAPI JSON：`GET /openapi.json`
- 在线文档（Scalar）：`GET /docs`
- 健康检查：`GET /`

`GET /` 会返回：

- 服务状态与版本
- 当前运行时（`bun` / `node` / `worker`）
- 基础系统信息（内存、平台、运行时版本等）

## 缓存说明

本服务全部为 `GET` 接口，天然适合缓存层。
同时服务端会按路径返回 `Cache-Control`（例如帖子列表更短缓存，文档更长缓存）。

你可以直接挂在：

- Cloudflare / CDN
- Nginx / Caddy 反向代理
- 浏览器本地缓存

这样可以明显降低回源请求量，提升响应速度。

## OpenAPI 参数注解说明（Zod v4）

本项目当前对 Query 参数采用字段级 `.describe(...)` 方式输出文档。
`hono-openapi` 在 Query `z.object(...).meta({ ref: "..." })` 场景下，可能出现参数折叠为单个 `$ref` 的情况，导致参数不完整。

因此当前建议：

- Query：优先使用字段 `.describe(...)`
- `meta({ ref })`：优先用于请求体/响应体 schema 复用

## Cloudflare Worker 打包说明

Worker 环境构建时，建议将 `undici` 别名到 `tieba.js` 内置 shim：

```bash
esbuild ./src/worker.ts \
  --bundle \
  --platform=node \
  --format=esm \
  --target=node22 \
  --alias:undici=./node_modules/tieba.js/dist/shims/undici.js \
  --outfile=out-worker/worker.js
```

原因是 `undici` 在 Worker 场景可能触发 Node/CJS 相关兼容问题；使用该别名可以保持运行时可用性。
