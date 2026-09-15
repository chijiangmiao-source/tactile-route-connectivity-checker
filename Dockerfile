# 一次性验收与开发共用镜像。
# 官方 Playwright 镜像内置 Chromium 及系统依赖，verify 服务可直接跑 E2E。
FROM mcr.microsoft.com/playwright:v1.49.1-jammy

WORKDIR /app

# 优先复制依赖清单，利用层缓存
COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# 构建期完成类型检查与产物构建，及早暴露问题
RUN npm run typecheck && npm run build

EXPOSE 5173

# 默认作为 Web 服务启动；verify 服务在 compose 中覆盖 command
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]
