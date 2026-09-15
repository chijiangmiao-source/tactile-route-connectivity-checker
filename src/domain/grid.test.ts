import { describe, expect, it } from 'vitest'
import {
  COLS,
  ROWS,
  analyzeCutCells,
  applyTool,
  colOf,
  countTiles,
  createEmptyState,
  findComponent,
  neighbors,
  rowOf,
  shortestPath,
  verifyGrid,
  type GridState,
} from './grid'

/**
 * 用字符串行构建栅格（每行 12 字符）：
 *   . 空白   # 触觉砖   X 障碍物   E 入口(触觉砖)   S 服务点(触觉砖)
 */
function build(rows: string[]): GridState {
  if (rows.length !== ROWS) throw new Error(`需要 ${ROWS} 行，收到 ${rows.length}`)
  const state = createEmptyState()
  rows.forEach((line, r) => {
    if (line.length !== COLS) throw new Error(`第 ${r} 行长度应为 ${COLS}，实际 ${line.length}`)
    for (let c = 0; c < COLS; c += 1) {
      const ch = line[c]
      const i = r * COLS + c
      if (ch === '#') state.cells[i] = 'tile'
      else if (ch === 'X') state.cells[i] = 'obstacle'
      else if (ch === 'E') {
        state.cells[i] = 'tile'
        state.entrance = i
      } else if (ch === 'S') {
        state.cells[i] = 'tile'
        state.service = i
      }
    }
  })
  return state
}

const blankRow = '.'.repeat(COLS)
const blanks = (n: number): string[] => Array.from({ length: n }, () => blankRow)

/** 只有一行触觉砖的标准通道，其余行为空 */
function corridor(): GridState {
  const rows = blanks(ROWS)
  rows[2] = '############'
  return build(rows)
}

describe('坐标与邻居次序', () => {
  it('行列换算正确', () => {
    expect(rowOf(0)).toBe(0)
    expect(colOf(0)).toBe(0)
    expect(rowOf(13)).toBe(1)
    expect(colOf(13)).toBe(1)
    expect(rowOf(COLS * ROWS - 1)).toBe(ROWS - 1)
    expect(colOf(COLS * ROWS - 1)).toBe(COLS - 1)
  })

  it('邻居严格按 上、右、下、左 排列', () => {
    const center = 3 * COLS + 4
    expect(neighbors(center)).toEqual([center - COLS, center + 1, center + COLS, center - 1])
  })

  it('边界处剔除越界方向后相对次序不变', () => {
    const topLeft = 0
    expect(neighbors(topLeft)).toEqual([1, COLS]) // 右、下
    const bottomRight = COLS * ROWS - 1
    expect(neighbors(bottomRight)).toEqual([bottomRight - COLS, bottomRight - 1]) // 上、左
  })
})

describe('四邻接连通遍历', () => {
  it('沿直通道全部可达', () => {
    const state = corridor()
    const comp = findComponent(state.entrance ?? 2 * COLS, state.cells)
    let count = 0
    comp.forEach((v) => {
      if (v) count += 1
    })
    expect(count).toBe(COLS)
  })

  it('对角相邻不算连通（禁止对角连接）', () => {
    const rows = blanks(ROWS)
    rows[0] = 'E...........'
    rows[1] = '.S..........'
    const state = build(rows)
    const comp = findComponent(state.entrance as number, state.cells)
    expect(comp[state.service as number]).toBe(0)
  })

  it('空格与障碍物阻断四邻接扩展', () => {
    const rows = blanks(ROWS)
    rows[4] = '#####X######'
    const state = build(rows)
    const comp = findComponent(0 + 4 * COLS, state.cells)
    expect(comp[5 + 4 * COLS]).toBe(0)
    for (let c = 0; c < 5; c += 1) expect(comp[c + 4 * COLS]).toBe(1)
  })

  it('非触觉砖起点返回空分量', () => {
    const state = corridor()
    const comp = findComponent(0, state.cells) // (0,0) 为空白
    expect(comp.some((v) => v === 1)).toBe(false)
  })
})

describe('最短路径与同长度并列的确定性', () => {
  it('直通道步数为曼哈顿距离', () => {
    const state = corridor()
    const found = shortestPath(2 * COLS, 2 * COLS + COLS - 1, state.cells)
    expect(found).not.toBeNull()
    expect(found!.steps).toBe(COLS - 1)
    expect(found!.path[0]).toBe(2 * COLS)
    expect(found!.path.at(-1)).toBe(2 * COLS + COLS - 1)
  })

  it('两步并列时先扩展“右”：路径为 右→下 而非 下→右', () => {
    const rows = blanks(ROWS)
    rows[1] = '.##.........'
    rows[2] = '.##.........'
    const state = build(rows)
    const e = 1 * COLS + 1
    const s = 2 * COLS + 2
    const found = shortestPath(e, s, state.cells)
    expect(found!.steps).toBe(2)
    expect(found!.path).toEqual([e, 1 * COLS + 2, s])
  })

  it('开放区域多条等长路径时结果唯一且确定（优先向右贴边）', () => {
    const rows = blanks(ROWS)
    rows[0] = '###.........'
    rows[1] = '###.........'
    rows[2] = '###.........'
    const state = build(rows)
    const e = 0
    const s = 2 * COLS + 2
    const found = shortestPath(e, s, state.cells)
    expect(found!.steps).toBe(4)
    expect(found!.path).toEqual([
      e,
      0 * COLS + 1,
      0 * COLS + 2,
      1 * COLS + 2,
      s,
    ])
  })

  it('重复计算结果完全一致（高亮唯一性）', () => {
    const rows = blanks(ROWS)
    for (let r = 1; r <= 3; r += 1) rows[r] = '####........'
    const state = build(rows)
    const a = shortestPath(1 * COLS, 3 * COLS + 3, state.cells)!.path
    const b = shortestPath(1 * COLS, 3 * COLS + 3, state.cells)!.path
    expect(a).toEqual(b)
  })

  it('不可达时返回 null', () => {
    const rows = blanks(ROWS)
    rows[3] = '###...###...'
    const state = build(rows)
    expect(shortestPath(3 * COLS, 3 * COLS + 8, state.cells)).toBeNull()
  })
})

describe('核验规则', () => {
  it('连续通道：通过且步数正确', () => {
    const rows = blanks(ROWS)
    rows[2] = 'E##########S'
    const state = build(rows)
    const result = verifyGrid(state)
    expect(result.ok).toBe(true)
    expect(result.connected).toBe(true)
    expect(result.issue).toBeNull()
    expect(result.steps).toBe(COLS - 1)
    expect(result.pathCells).toHaveLength(COLS)
    expect(result.issueCells).toEqual([])
  })

  it('绕障路径仍可通过（同长度时优先向上绕行）', () => {
    const rows = blanks(ROWS)
    rows[1] = '############'
    rows[2] = '#####X######'
    rows[3] = '############'
    const state = build(rows)
    state.entrance = 2 * COLS
    state.service = 2 * COLS + 11
    const result = verifyGrid(state)
    expect(result.ok).toBe(true)
    expect(result.steps).toBe(13) // 11 格横向 + 上下绕行 2 步
    // 上邻接优先：经第 1 行而非第 3 行绕行
    expect(result.pathCells).toContain(1 * COLS + 5)
    expect(result.pathCells).not.toContain(3 * COLS + 5)
  })

  it('孤岛：主路线连通但存在孤立触觉砖时不通过，孤岛格被标出且路径仍高亮', () => {
    const rows = blanks(ROWS)
    rows[2] = 'E##########S'
    rows[5] = '.....#......'
    const state = build(rows)
    const lone = 5 * COLS + 5
    const result = verifyGrid(state)
    expect(result.ok).toBe(false)
    expect(result.connected).toBe(true)
    expect(result.issue?.code).toBe('isolated-tile')
    expect(result.issueCells).toEqual([lone])
    expect(result.steps).toBe(COLS - 1)
    expect(result.pathCells).toHaveLength(COLS)
  })

  it('断路：入口与服务点不连通时不通过', () => {
    const rows = blanks(ROWS)
    rows[2] = 'E#####.####S'
    const state = build(rows)
    const result = verifyGrid(state)
    expect(result.ok).toBe(false)
    expect(result.connected).toBe(false)
    expect(result.issue?.code).toBe('not-connected')
    expect(result.steps).toBeNull()
    expect(result.pathCells).toEqual([])
    // 缺口对侧的触觉砖全部属于入口分量之外
    expect(result.issueCells).toContain(state.service as number)
    expect(result.issueCells).toHaveLength(5)
  })

  it('补上一格使断路连通：立即得到确定路径并通过，不再有红格', () => {
    const rows = blanks(ROWS)
    rows[2] = 'E#####.####S'
    const before = build(rows)
    expect(verifyGrid(before).ok).toBe(false)

    const gap = 2 * COLS + 6
    const after = applyTool(before, 'tile', gap)
    const result = verifyGrid(after)
    expect(result.ok).toBe(true)
    expect(result.steps).toBe(COLS - 1)
    expect(result.pathCells).toHaveLength(COLS)
    expect(result.issueCells).toEqual([])
  })

  it('补通主路后，任何孤立触觉砖仍保持标红并阻止通过', () => {
    const rows = blanks(ROWS)
    rows[2] = 'E#####.####S'
    rows[6] = '...#........'
    const broken = build(rows)
    const lone = 6 * COLS + 3

    const fixed = applyTool(broken, 'tile', 2 * COLS + 6)
    const result = verifyGrid(fixed)
    expect(result.connected).toBe(true)
    expect(result.ok).toBe(false)
    expect(result.issue?.code).toBe('isolated-tile')
    expect(result.issueCells).toEqual([lone])
    expect(result.steps).toBe(COLS - 1)
  })

  it('仅对角相邻时判定不连通', () => {
    const rows = blanks(ROWS)
    rows[3] = 'E...........'
    rows[4] = '.S..........'
    const result = verifyGrid(build(rows))
    expect(result.ok).toBe(false)
    expect(result.issue?.code).toBe('not-connected')
  })

  it('缺少入口 / 缺少服务点', () => {
    const rows = blanks(ROWS)
    rows[0] = '...........S'
    const noEntrance = build(rows)
    expect(verifyGrid(noEntrance).issue?.code).toBe('entrance-missing')

    const rows2 = blanks(ROWS)
    rows2[0] = 'E...........'
    expect(verifyGrid(build(rows2)).issue?.code).toBe('service-missing')
  })

  it('端点落在障碍物或空白上时标出问题格', () => {
    const state = createEmptyState()
    state.cells[5] = 'obstacle'
    state.entrance = 5
    state.cells[6] = 'tile'
    state.service = 6
    const result = verifyGrid(state)
    expect(result.ok).toBe(false)
    expect(result.issue?.code).toBe('entrance-not-on-tile')
    expect(result.issueCells).toEqual([5])
  })

  it('端点重合时不通过', () => {
    const state = createEmptyState()
    state.cells[10] = 'tile'
    state.entrance = 10
    state.service = 10
    const result = verifyGrid(state)
    expect(result.issue?.code).toBe('endpoints-coincide')
    expect(result.issueCells).toEqual([10])
  })
})

describe('编辑与统计', () => {
  it('触觉砖总数随编辑变化', () => {
    let state = createEmptyState()
    expect(countTiles(state)).toBe(0)
    state = applyTool(state, 'tile', 0)
    state = applyTool(state, 'tile', 1)
    expect(countTiles(state)).toBe(2)
    state = applyTool(state, 'empty', 0)
    expect(countTiles(state)).toBe(1)
  })

  it('同类型重复编辑返回同一引用（不入撤销栈）', () => {
    const state = createEmptyState()
    expect(applyTool(state, 'empty', 0)).toBe(state)
    const withTile = applyTool(state, 'tile', 0)
    expect(applyTool(withTile, 'tile', 0)).toBe(withTile)
  })

  it('端点可直接落在空白格上（标记后等待核验报错标红）', () => {
    const state = createEmptyState()
    const next = applyTool(state, 'entrance', 7)
    expect(next.entrance).toBe(7)
    expect(next.cells[7]).toBe('empty')
    expect(verifyGrid(next).issue?.code).toBe('service-missing')
  })
})

describe('单点中断分析（割点）', () => {
  it('直线通道：全部内部格均为风险格，影响区为服务点一侧后缀', () => {
    const rows = blanks(ROWS)
    rows[2] = 'E##########S'
    const state = build(rows)
    expect(verifyGrid(state).ok).toBe(true)

    const analysis = analyzeCutCells(state)
    const expectedRisk = Array.from({ length: COLS - 2 }, (_, k) => 2 * COLS + 1 + k)
    expect(analysis.riskCells).toEqual(expectedRisk)
    expect(analysis.affectedCells).toHaveLength(COLS - 2)

    // 封闭第 5 列（索引 28）：服务点一侧 29..35 共 7 格不可达
    const at = analysis.riskCells.indexOf(2 * COLS + 4)
    expect(analysis.affectedCells[at]).toEqual([29, 30, 31, 32, 33, 34, 35])
    // 封闭紧邻服务点的格：仅服务点自身受影响
    const last = analysis.riskCells.indexOf(2 * COLS + 10)
    expect(analysis.affectedCells[last]).toEqual([2 * COLS + 11])

    // 影响区不含被封闭格本身、按格索引升序，且服务点始终受影响
    for (let k = 0; k < analysis.riskCells.length; k += 1) {
      const affected = analysis.affectedCells[k]
      expect(affected).not.toContain(analysis.riskCells[k])
      expect([...affected].sort((a, b) => a - b)).toEqual(affected)
      expect(affected).toContain(2 * COLS + 11)
    }
  })

  it('环形路线：封闭任意单格都不会切断两端点，无风险格', () => {
    const rows = blanks(ROWS)
    rows[1] = '..#####.....'
    rows[2] = '..E...S.....'
    rows[3] = '..#####.....'
    const state = build(rows)
    expect(verifyGrid(state).ok).toBe(true)

    const analysis = analyzeCutCells(state)
    expect(analysis.riskCells).toEqual([])
    expect(analysis.affectedCells).toEqual([])
  })

  it('带支路：只报告真正切断两端点的格，支路砖不是风险格', () => {
    const rows = blanks(ROWS)
    rows[0] = '.....#......'
    rows[1] = '.....#......'
    rows[2] = 'E##########S'
    const state = build(rows)
    expect(verifyGrid(state).ok).toBe(true)

    const analysis = analyzeCutCells(state)
    // 风险格恰为主通道内部 10 格；支路格 (0,5)=5、(1,5)=17 不在其中
    expect(analysis.riskCells).toEqual(Array.from({ length: COLS - 2 }, (_, k) => 2 * COLS + 1 + k))

    // 封闭支路交汇格 (2,5)=29：支路随服务点一侧一并失联
    const junction = analysis.riskCells.indexOf(2 * COLS + 5)
    expect(analysis.affectedCells[junction]).toEqual([
      0 * COLS + 5,
      1 * COLS + 5,
      2 * COLS + 6,
      2 * COLS + 7,
      2 * COLS + 8,
      2 * COLS + 9,
      2 * COLS + 10,
      2 * COLS + 11,
    ])

    // 封闭 (2,8)=32：支路仍在入口一侧，不受影响
    const downstream = analysis.riskCells.indexOf(2 * COLS + 8)
    expect(analysis.affectedCells[downstream]).toEqual([2 * COLS + 9, 2 * COLS + 10, 2 * COLS + 11])
  })

  it('端点永不作为风险格：两格直连时没有可封闭的候选', () => {
    const rows = blanks(ROWS)
    rows[4] = 'ES..........'
    const state = build(rows)
    expect(verifyGrid(state).ok).toBe(true)
    expect(analyzeCutCells(state).riskCells).toEqual([])
  })

  it('三格通道：唯一中间格是风险格，影响区恰为服务点', () => {
    const rows = blanks(ROWS)
    rows[4] = 'E#S.........'
    const state = build(rows)
    const analysis = analyzeCutCells(state)
    expect(analysis.riskCells).toEqual([4 * COLS + 1])
    expect(analysis.affectedCells[0]).toEqual([4 * COLS + 2])
  })

  it('核验未通过时返回空分析（断路、缺端点、空棋盘）', () => {
    const rows = blanks(ROWS)
    rows[2] = 'E#####.####S'
    const broken = build(rows)
    expect(verifyGrid(broken).ok).toBe(false)
    expect(analyzeCutCells(broken)).toEqual({ riskCells: [], affectedCells: [] })

    expect(analyzeCutCells(createEmptyState())).toEqual({ riskCells: [], affectedCells: [] })
  })

  it('结果确定：重复计算完全一致', () => {
    const rows = blanks(ROWS)
    rows[0] = '.....#......'
    rows[1] = '.....#......'
    rows[2] = 'E##########S'
    const state = build(rows)
    expect(analyzeCutCells(state)).toEqual(analyzeCutCells(state))
  })
})
