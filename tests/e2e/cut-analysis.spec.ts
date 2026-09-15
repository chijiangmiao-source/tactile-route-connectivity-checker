import { expect, test } from '@playwright/test'

const COLS = 12
const idx = (r: number, c: number): number => r * COLS + c

// 完整示例：第 2 行直通道，入口 (2,0)=24，服务点 (2,11)=35，内部格 25..34
const ENTRANCE = idx(2, 0)
const SERVICE = idx(2, 11)

test.beforeEach(async ({ page }) => {
  await page.goto('/')
})

test('启动分析：直通道全部内部格标橙，点选风险格预览服务点一侧影响区', async ({ page }) => {
  await page.locator('[data-testid="btn-example-pass"]').click()
  await expect(page.locator('[data-testid="verdict-ok"]')).toBeVisible()

  // 未启动分析时没有任何风险标记
  await expect(page.locator('[data-cut="1"]')).toHaveCount(0)

  await page.locator('[data-testid="btn-cut-analysis"]').click()
  await expect(page.locator('[data-testid="cut-summary"]')).toContainText('10 格风险格')

  // 内部 10 格全部标橙；端点不是风险格
  await expect(page.locator('[data-cut="1"]')).toHaveCount(10)
  await expect(page.locator(`[data-testid="cell-${ENTRANCE}"]`)).toHaveAttribute('data-cut', '0')
  await expect(page.locator(`[data-testid="cell-${SERVICE}"]`)).toHaveAttribute('data-cut', '0')
  await expect(page.locator(`[data-testid="cell-${idx(2, 1)}"]`)).toHaveAttribute('data-cut', '1')
  await expect(page.locator('[data-affected="1"]')).toHaveCount(0)

  // 点选 (2,5)：服务点一侧 6 格（含服务点）进入影响区
  const cut = idx(2, 5)
  await page.locator(`[data-testid="cell-${cut}"]`).click()
  await expect(page.locator('[data-testid="cut-detail"]')).toContainText('第 3 行第 6 列')
  await expect(page.locator('[data-testid="cut-detail"]')).toContainText('6 格不可达')
  await expect(page.locator('[data-affected="1"]')).toHaveCount(6)
  await expect(page.locator(`[data-testid="cell-${SERVICE}"]`)).toHaveAttribute('data-affected', '1')
  await expect(page.locator(`[data-testid="cell-${idx(2, 6)}"]`)).toHaveAttribute('data-affected', '1')
  // 被封闭格本身与入口一侧不在影响区内
  await expect(page.locator(`[data-testid="cell-${cut}"]`)).toHaveAttribute('data-affected', '0')
  await expect(page.locator(`[data-testid="cell-${idx(2, 4)}"]`)).toHaveAttribute('data-affected', '0')
  await expect(page.locator(`[data-testid="cell-${cut}"]`)).toHaveAttribute('data-cut-selected', '1')

  // 点选只预览不绘制：棋盘未被改动
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('12')
  await expect(page.locator(`[data-testid="cell-${cut}"]`)).toHaveAttribute('data-kind', 'tile')

  // 再次点选同一格取消选中；改选相邻格则影响区随之移动
  await page.locator(`[data-testid="cell-${cut}"]`).click()
  await expect(page.locator('[data-affected="1"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="cut-detail"]')).toHaveCount(0)
  await page.locator(`[data-testid="cell-${idx(2, 6)}"]`).click()
  await expect(page.locator('[data-testid="cut-detail"]')).toContainText('5 格不可达')
  await expect(page.locator('[data-affected="1"]')).toHaveCount(5)
})

test('分析进行中编辑路线：立即清除旧选择并按当前棋盘重算，撤销同样刷新', async ({ page }) => {
  await page.locator('[data-testid="btn-example-pass"]').click()
  await page.locator('[data-testid="btn-cut-analysis"]').click()
  await expect(page.locator('[data-cut="1"]')).toHaveCount(10)

  // 先选中一格，确认影响区出现
  await page.locator(`[data-testid="cell-${idx(2, 5)}"]`).click()
  await expect(page.locator('[data-affected="1"]')).toHaveCount(6)

  // 在通道上方补三格形成环形绕行（默认工具即触觉砖）
  for (const c of [4, 5, 6]) await page.locator(`[data-testid="cell-${idx(1, c)}"]`).click()
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('15')

  // 旧选择被清除，风险格按新棋盘重算：(2,5) 被环形旁路绕过，仅剩 9 格
  await expect(page.locator('[data-testid="cut-detail"]')).toHaveCount(0)
  await expect(page.locator('[data-affected="1"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="cut-summary"]')).toContainText('9 格风险格')
  await expect(page.locator('[data-cut="1"]')).toHaveCount(9)
  await expect(page.locator(`[data-testid="cell-${idx(2, 5)}"]`)).toHaveAttribute('data-cut', '0')
  await expect(page.locator(`[data-testid="cell-${idx(2, 4)}"]`)).toHaveAttribute('data-cut', '1')

  // 撤销三步回到直通道，风险格恢复为 10 格
  const undo = page.locator('[data-testid="btn-undo"]')
  await undo.click()
  await undo.click()
  await undo.click()
  await expect(page.locator('[data-testid="stat-tiles"]')).toHaveText('12')
  await expect(page.locator('[data-cut="1"]')).toHaveCount(10)
  await expect(page.locator(`[data-testid="cell-${idx(2, 5)}"]`)).toHaveAttribute('data-cut', '1')
})

test('核验未通过时不产生过期覆盖层，修复后按当前棋盘自动重算', async ({ page }) => {
  await page.locator('[data-testid="btn-example-pass"]').click()
  await page.locator('[data-testid="btn-cut-analysis"]').click()
  await page.locator(`[data-testid="cell-${idx(2, 5)}"]`).click()
  await expect(page.locator('[data-affected="1"]')).toHaveCount(6)

  // 载入断路示例：旧的风险标记与影响区立即消失，并提示先修复
  await page.locator('[data-testid="btn-example-broken"]').click()
  await expect(page.locator('[data-testid="verdict-bad"]')).toBeVisible()
  await expect(page.locator('[data-cut="1"]')).toHaveCount(0)
  await expect(page.locator('[data-affected="1"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="cut-blocked"]')).toContainText('先修复')

  // 补上断路格后仍有孤岛，核验未通过，仍无覆盖层
  await page.locator('[data-testid="tool-tile"]').click()
  await page.locator(`[data-testid="cell-${idx(2, 6)}"]`).click()
  await expect(page.locator('[data-testid="verdict-bad"]')).toBeVisible()
  await expect(page.locator('[data-cut="1"]')).toHaveCount(0)

  // 清除孤岛后核验通过：分析保持开启，按当前棋盘自动重算，旧选择不复活
  await page.locator('[data-testid="tool-empty"]').click()
  await page.locator(`[data-testid="cell-${idx(7, 11)}"]`).click()
  await expect(page.locator('[data-testid="verdict-ok"]')).toBeVisible()
  await expect(page.locator('[data-testid="cut-summary"]')).toContainText('10 格风险格')
  await expect(page.locator('[data-cut="1"]')).toHaveCount(10)
  await expect(page.locator('[data-affected="1"]')).toHaveCount(0)
  await expect(page.locator(`[data-testid="cell-${idx(2, 5)}"]`)).toHaveAttribute(
    'data-cut-selected',
    '0',
  )
})

test('未通过时点击分析按钮展示先修复反馈，且不产生任何覆盖层', async ({ page }) => {
  await page.locator('[data-testid="btn-example-broken"]').click()
  await expect(page.locator('[data-testid="verdict-bad"]')).toBeVisible()

  await page.locator('[data-testid="btn-cut-analysis"]').click()
  await expect(page.locator('[data-testid="btn-cut-analysis"]')).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(page.locator('[data-testid="cut-blocked"]')).toContainText('原核验未通过')
  await expect(page.locator('[data-testid="cut-blocked"]')).toContainText('先修复')
  await expect(page.locator('[data-cut="1"]')).toHaveCount(0)
  await expect(page.locator('[data-affected="1"]')).toHaveCount(0)

  // 再次点击关闭分析，回到未分析提示
  await page.locator('[data-testid="btn-cut-analysis"]').click()
  await expect(page.locator('[data-testid="btn-cut-analysis"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.locator('[data-testid="cut-hint"]')).toBeVisible()
})
