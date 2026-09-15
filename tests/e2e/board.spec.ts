import { expect, test } from '@playwright/test'

const COLS = 12
const idx = (r: number, c: number): number => r * COLS + c

// SVG polyline 使用 fill="none"，Playwright 会将其算作 hidden；
// 用“存在且有非空边界盒”表示路径已渲染
async function expectPathDrawn(page: import('@playwright/test').Page) {
  const line = page.locator('[data-testid="path-line"]')
  await expect(line).toHaveCount(1)
  const box = await line.boundingBox()
  expect(box).not.toBeNull()
  expect(box!.width).toBeGreaterThan(0)
  expect(box!.height).toBeGreaterThan(0)
}

async function expectNoPath(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-testid="path-line"]')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('初始为空白 96 格，选择工具后单击可绘制触觉砖并即时统计', async ({ page }) => {
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('0')

  // 默认工具即触觉砖
  await page.locator('[data-testid="tool-tile"]').click()
  await page.locator('[data-testid="cell-0"]').click()
  await page.locator(`[data-testid="cell-${idx(0, 1)}"]`).click()
  await page.locator(`[data-testid="cell-${idx(1, 0)}"]`).click()

  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('3')
  await expect(page.locator('[data-testid="cell-0"]')).toHaveAttribute('data-kind', 'tile')
  await expect(page.locator(`[data-testid="cell-${idx(1, 1)}"]`)).toHaveAttribute(
    'data-kind',
    'empty',
  )
  // 对角砖不产生路径
  await expectNoPath(page)
})

test('端点落在空白上立即标红并给出原因；两端点落在同一触觉砖时报告重合', async ({ page }) => {
  // 两个端点先点在空白格上
  await page.locator('[data-testid="tool-entrance"]').click()
  await page.locator('[data-testid="cell-30"]').click()
  await page.locator('[data-testid="tool-service"]').click()
  await page.locator('[data-testid="cell-31"]').click()

  await expect(page.locator('[data-testid="verdict-bad"]')).toBeVisible()
  await expect(page.locator('[data-testid="verdict-reason"]')).toContainText('入口必须落在触觉砖上')
  await expect(page.locator('[data-testid="cell-30"]')).toHaveAttribute('data-issue', '1')

  // 两块相邻触觉砖补齐后通过
  await page.locator('[data-testid="tool-tile"]').click()
  await page.locator('[data-testid="cell-30"]').click()
  await page.locator('[data-testid="cell-31"]').click()
  await expect(page.locator('[data-testid="verdict-ok"]')).toBeVisible()

  // 服务点移到入口同格 → 重合错误
  await page.locator('[data-testid="tool-service"]').click()
  await page.locator('[data-testid="cell-30"]').click()
  await expect(page.locator('[data-testid="verdict-reason"]')).toContainText('不得重合')
  await expect(page.locator('[data-testid="cell-30"]')).toHaveAttribute('data-issue', '1')
})

test('断路示例：补一格后立刻出现确定路径，但角落孤立砖保持红色并阻止通过', async ({ page }) => {
  await page.locator('[data-testid="btn-example-broken"]').click()

  // 主通道第 2 行在第 6 列断开，且 (7,11) 有孤立铺设
  const gap = idx(2, 6)
  const lone = idx(7, 11)

  await expect(page.locator('[data-testid="verdict-bad"]')).toBeVisible()
  await expect(page.locator('[data-testid="verdict-reason"]')).toContainText('不连通')
  await expect(page.locator(`[data-testid="cell-${gap}"]`)).toHaveAttribute('data-kind', 'empty')
  await expectNoPath(page)
  await expect(page.locator('[data-testid="stat-steps"]')).toHaveText('—')

  // 补上断路上的那格触觉砖
  await page.locator('[data-testid="tool-tile"]').click()
  await page.locator(`[data-testid="cell-${gap}"]`).click()

  // 立即出现确定的唯一高亮路径
  await expectPathDrawn(page)
  await expect(page.locator('[data-testid="stat-steps"]')).toHaveText('11')
  // 主路 12 格 + 孤岛 1 格
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('13')

  // 但孤立触觉砖仍标红，核验仍不通过
  await expect(page.locator('[data-testid="verdict-bad"]')).toBeVisible()
  await expect(page.locator('[data-testid="verdict-reason"]')).toContainText('孤立')
  await expect(page.locator(`[data-testid="cell-${lone}"]`)).toHaveAttribute('data-issue', '1')

  // 清除孤岛后通过
  await page.locator('[data-testid="tool-empty"]').click()
  await page.locator(`[data-testid="cell-${lone}"]`).click()
  await expect(page.locator('[data-testid="verdict-ok"]')).toBeVisible()
  await expect(page.locator(`[data-testid="cell-${lone}"]`)).toHaveAttribute('data-issue', '0')
})

test('完整示例直接通过，主通道 12 格全部沿唯一路径高亮', async ({ page }) => {
  await page.locator('[data-testid="btn-example-pass"]').click()

  await expect(page.locator('[data-testid="verdict-ok"]')).toBeVisible()
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('12')
  await expect(page.locator('[data-testid="stat-steps"]')).toHaveText('11')
  await expectPathDrawn(page)

  const pathCells = page.locator('[data-path="1"]')
  await expect(pathCells).toHaveCount(12)

  // 高亮严格轴对齐：相邻路径格坐标差只在一个轴上（禁止对角）
  const points = await page.locator('[data-testid="path-line"]').getAttribute('points')
  const coords = points!.trim().split(/\s+/).map((p) => p.split(',').map(Number))
  for (let i = 1; i < coords.length; i += 1) {
    const dx = Math.abs(coords[i][0] - coords[i - 1][0])
    const dy = Math.abs(coords[i][1] - coords[i - 1][1])
    // 相邻段必须恰好为水平 56 或垂直 56，绝不允许对角
    expect(dx === 56 && dy === 0 ? true : dx === 0 && dy === 56).toBe(true)
  }
})

test('撤销最近一步：绘制、补路、清除均可逐步撤销，空栈时按钮禁用', async ({ page }) => {
  const undo = page.locator('[data-testid="btn-undo"]')
  await expect(undo).toBeDisabled()

  await page.locator('[data-testid="tool-tile"]').click()
  await page.locator('[data-testid="cell-0"]').click()
  await page.locator('[data-testid="cell-1"]').click()
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('2')
  await expect(undo).toBeEnabled()

  await undo.click()
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('1')
  await expect(page.locator('[data-testid="cell-1"]')).toHaveAttribute('data-kind', 'empty')
  await expect(page.locator('[data-testid="cell-0"]')).toHaveAttribute('data-kind', 'tile')

  await undo.click()
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('0')
  await expect(undo).toBeDisabled()

  // 撤销同样适用于“断路示例 → 补格”这类操作序列
  await page.locator('[data-testid="btn-example-broken"]').click()
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('12')
  await undo.click()
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('0')
})

test('障碍物阻断路径，端点标记显示在格上', async ({ page }) => {
  // 横向 3 格触觉砖，中间放障碍
  await page.locator('[data-testid="tool-tile"]').click()
  for (const c of [0, 1, 2]) await page.locator(`[data-testid="cell-${idx(4, c)}"]`).click()
  await page.locator('[data-testid="tool-obstacle"]').click()
  await page.locator(`[data-testid="cell-${idx(4, 1)}"]`).click()

  await page.locator('[data-testid="tool-entrance"]').click()
  await page.locator(`[data-testid="cell-${idx(4, 0)}"]`).click()
  await page.locator('[data-testid="tool-service"]').click()
  await page.locator(`[data-testid="cell-${idx(4, 2)}"]`).click()

  await expect(page.locator('[data-testid="verdict-reason"]')).toContainText('不连通')
  await expect(page.locator(`[data-testid="cell-${idx(4, 0)}"]`)).toHaveAttribute(
    'data-entrance',
    '1',
  )
  await expect(page.locator(`[data-testid="cell-${idx(4, 2)}"]`)).toHaveAttribute(
    'data-service',
    '1',
  )
})
