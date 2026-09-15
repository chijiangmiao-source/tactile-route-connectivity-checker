# 触觉引导砖核验板（Tactile Tiles Verifier）

车站服务台迁移后，现场照片上看似连续的触觉引导砖可能隔着一个空格，角落还可能遗留与主路线无关的孤立铺设。本工具是一个**纯前端核验板**：在固定 **12 列 × 8 行** 栅格中逐格标注，自行完成四邻接连通遍历与确定性最短路径搜索，不依赖任何在线地图或外部接口。

技术栈：**TypeScript · Vue 3 · Vite · SVG · Vitest · Playwright · Docker Compose**。

## 核验规则

- 每格三选一：**空白 / 触觉砖 / 障碍物**；另分别设置**一个入口**与**一个服务点**。
- 两个端点都必须落在触觉砖上，且不得重合。
- 路径只允许**上下左右**穿过触觉砖（斜对角不算连接，障碍与空格阻断）。
- 通过条件：
  1. 入口与服务点四邻接连通；
  2. **所有**触觉砖都属于入口所在连通分量（断路对侧砖、角落孤立铺设都会被标红）。
- 不通过时红色描边标出问题格并给出中文原因；编辑后结论立即刷新。

## 路径确定性

最短路径由自实现的 BFS 求出，邻居固定按 **上 → 右 → 下 → 左** 顺序扩展，首次到达即记录父节点。存在多条等长最短路时，高亮结果仍唯一确定（例：开放区域中优先向右贴边；绕障时优先向上绕行）。单测对并列路径的路径序列有精确断言。

## 界面信息

- 触觉砖总数
- 入口 → 服务点的最少步数（边数；不可达时显示 “—”）
- 连通状态、通过/不通过结论与原因、问题格红标、唯一路径蓝线高亮
- **撤销最近一步**（仅记录发生实际变化的操作，可连续撤销）
- 内置“断路示例 / 完整示例”：断路示例中第 2 行主通道第 7 格断开、右下角有一块孤立铺设——补上那格立刻出现确定路径，但孤立砖保持红色并阻止通过，清除后才核验通过。

## 本地开发

```bash
npm ci
npm run dev        # http://localhost:5173
npm run typecheck  # vue-tsc 类型检查
npm run build      # 生产构建
npm test           # Vitest 单元测试（连通 / 孤岛 / 并列路径判据）
npx playwright install --with-deps chromium   # 首次运行 E2E 前安装浏览器
npm run test:e2e   # Playwright（绘制 / 撤销 / 高亮）
npm run verify     # 一次性验收：Vitest + Playwright
```

## Docker Compose

```bash
# Web 服务，宿主端口可用 WEB_PORT 覆盖（默认 8080）
WEB_PORT=9090 docker compose up --build
# 打开 http://localhost:9090

# 一次性验收服务：类型/构建已在镜像内完成，run 结束即退出
docker compose build verify
docker compose run --rm verify
```

`verify` 不随 `docker compose up` 启动（置于 `verify` profile），仅供显式一次性调用；Playwright 配置中的 `webServer` 会在容器内自行拉起 Vite，因此验收不依赖 `web` 服务。镜像基于官方 `mcr.microsoft.com/playwright`，内置 Chromium 与系统库。

## 目录结构

```
src/
  domain/grid.ts          # 纯领域逻辑：四邻接遍历、确定性 BFS、核验、编辑
  domain/grid.test.ts     # Vitest 判据（25 个用例）
  components/BoardView.vue# SVG 栅格：绘制、问题格红标、路径高亮
  App.vue                 # 工具、撤销栈、统计与结论面板
tests/e2e/board.spec.ts   # Playwright：绘制 / 撤销 / 高亮 / 孤岛保红
Dockerfile · docker-compose.yml
```

## 算法说明

- `findComponent(start, cells)`：在触觉砖子图上做迭代式四邻接洪水遍历，返回入口连通分量掩码。
- `shortestPath(start, goal, cells)`：单位权重 BFS，父节点表保证每个节点只被第一次发现的方向写入；回溯即得唯一确定路径。
- `verifyGrid(state)`：依次校验端点存在、落砖、不重合、连通、无分量外触觉砖；任一条失败即返回原因与涉事格。
