# syntax=docker/dockerfile:1.7

FROM node:24-alpine AS build
WORKDIR /app

COPY package.json tsconfig.json ./

# API 子仓库独立构建时，将 monorepo workspace 依赖改为可安装版本
RUN node -e "const { readFileSync, writeFileSync } = require('node:fs'); const pkg = JSON.parse(readFileSync('package.json', 'utf8')); if (pkg.dependencies?.['tieba.js'] === 'workspace:*') pkg.dependencies['tieba.js'] = '^3.1.3'; writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');"

RUN npm install --no-audit --no-fund

COPY src ./src

RUN npm run build:node

FROM node:24-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production

COPY --from=build /app/out /app/out

EXPOSE 8000

CMD ["node", "/app/out/index.js"]
