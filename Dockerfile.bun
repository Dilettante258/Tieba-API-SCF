# syntax=docker/dockerfile:1.7

FROM oven/bun:1.3.9-alpine AS build
WORKDIR /app

COPY package.json tsconfig.json ./

# API 子仓库独立构建时，将 monorepo workspace 依赖改为可安装版本
RUN bun -e "import { readFileSync, writeFileSync } from 'node:fs'; const pkg = JSON.parse(readFileSync('package.json', 'utf8')); if (pkg.dependencies?.['tieba.js'] === 'workspace:*') pkg.dependencies['tieba.js'] = '^3.0.0'; if (pkg.dependencies?.['@tieba/db'] === 'workspace:*') delete pkg.dependencies['@tieba/db']; writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');"

RUN bun install

COPY src ./src

RUN bun run build

FROM oven/bun:1.3.9-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/out /app/out

EXPOSE 8000

CMD ["bun", "/app/out/index.js"]
