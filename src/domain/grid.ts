/**
 * 触觉引导砖核验板 —— 领域模型
 * 固定 12 列 × 8 行栅格，索引按行优先：index = row * COLS + col
 */

export const COLS = 12
export const ROWS = 8
export const CELL_COUNT = COLS * ROWS

/** 空白 / 触觉砖 / 障碍物 */
export type CellKind = 'empty' | 'tile' | 'obstacle'

/** 编辑工具：三种格子类型 + 两个端点 */
export type Tool = CellKind | 'entrance' | 'service'

export interface GridState {
  /** 长度固定为 CELL_COUNT */
  cells: CellKind[]
  /** 入口格索引，未设置为 null */
  entrance: number | null
  /** 服务点格索引，未设置为 null */
  service: number | null
}

export type IssueCode =
  | 'entrance-missing'
  | 'service-missing'
  | 'entrance-not-on-tile'
  | 'service-not-on-tile'
  | 'endpoints-coincide'
  | 'not-connected'
  | 'isolated-tile'

export interface Issue {
  code: IssueCode
  message: string
  /** 涉事格（需标红） */
  cells: number[]
}

export interface VerificationResult {
  /** 两端点连通且所有触觉砖均属于入口所在连通分量 */
  ok: boolean
  /** 入口与服务点是否连通（即使连通也可能因孤岛不通过） */
  connected: boolean
  issue: Issue | null
  /** 标红格索引（问题端点或入口分量之外的触觉砖） */
  issueCells: number[]
  /** 唯一高亮路径上的格索引（连通时即算出，孤岛场景仍展示） */
  pathCells: number[]
  /** 入口至服务点的最少步数（边数），无法计算时为 null */
  steps: number | null
}

export function createEmptyState(): GridState {
  return {
    cells: new Array<CellKind>(CELL_COUNT).fill('empty'),
    entrance: null,
    service: null,
  }
}

export function rowOf(index: number): number {
  return Math.floor(index / COLS)
}

export function colOf(index: number): number {
  return index % COLS
}

/**
 * 四邻接邻居，严格按 上 → 右 → 下 → 左 顺序返回（越界方向剔除）。
 * 剔除越界方向不改变剩余方向的相对次序，因此遍历次序仍是确定的。
 */
export function neighbors(index: number): number[] {
  const row = rowOf(index)
  const col = colOf(index)
  const out: number[] = []
  if (row > 0) out.push(index - COLS) // 上
  if (col < COLS - 1) out.push(index + 1) // 右
  if (row < ROWS - 1) out.push(index + COLS) // 下
  if (col > 0) out.push(index - 1) // 左
  return out
}

/**
 * 从 start 出发在触觉砖上做四邻接洪水遍历（迭代 DFS，避免递归）。
 * 仅 kind === 'tile' 的格可通行；空白、障碍物一律阻断，禁止对角连接。
 * 返回长度 CELL_COUNT 的掩码：1 表示属于该连通分量。
 */
export function findComponent(start: number, cells: readonly CellKind[]): Uint8Array {
  const mask = new Uint8Array(CELL_COUNT)
  if (cells[start] !== 'tile') return mask
  mask[start] = 1
  const stack: number[] = [start]
  while (stack.length > 0) {
    const current = stack.pop() as number
    for (const next of neighbors(current)) {
      if (mask[next] === 0 && cells[next] === 'tile') {
        mask[next] = 1
        stack.push(next)
      }
    }
  }
  return mask
}

/**
 * BFS 最短路径（单位权重）。
 * 邻居固定按 上、右、下、左 扩展，首次到达即记录父节点；
 * 因此即使图中存在多条等长最短路，重建出的也是唯一确定的一条
 * （在该扩展次序下最早被发现的路径）。
 */
export function shortestPath(
  start: number,
  goal: number,
  cells: readonly CellKind[],
): { path: number[]; steps: number } | null {
  if (cells[start] !== 'tile' || cells[goal] !== 'tile') return null
  if (start === goal) return { path: [start], steps: 0 }

  const UNVISITED = -2
  const parent = new Int32Array(CELL_COUNT).fill(UNVISITED)
  parent[start] = -1
  const queue: number[] = [start]
  let head = 0

  while (head < queue.length) {
    const current = queue[head++]
    for (const next of neighbors(current)) {
      if (parent[next] !== UNVISITED || cells[next] !== 'tile') continue
      parent[next] = current
      if (next === goal) {
        const path = reconstructPath(parent, goal)
        return { path, steps: path.length - 1 }
      }
      queue.push(next)
    }
  }
  return null
}

function reconstructPath(parent: Int32Array, goal: number): number[] {
  const path: number[] = []
  let cursor: number = goal
  while (cursor !== -1) {
    path.push(cursor)
    cursor = parent[cursor]
  }
  path.reverse()
  return path
}

export function countTiles(state: GridState): number {
  let total = 0
  for (const cell of state.cells) {
    if (cell === 'tile') total += 1
  }
  return total
}

/**
 * 核验规则（任一不满足即不通过，并给出涉事格用于标红）：
 * 1. 入口、服务点均已设置；
 * 2. 两个端点都落在触觉砖上；
 * 3. 入口与服务点不得重合；
 * 4. 两端点四邻接连通（禁止对角）；
 * 5. 所有触觉砖都属于入口所在连通分量（无孤岛、无孤立铺设）。
 */
export function verifyGrid(state: GridState): VerificationResult {
  const { cells, entrance, service } = state

  if (entrance === null) {
    return failure('entrance-missing', '尚未设置入口：请在栅格中放置一个入口。')
  }
  if (service === null) {
    return failure('service-missing', '尚未设置服务点：请在栅格中放置一个服务点。')
  }
  if (cells[entrance] !== 'tile') {
    return failure('entrance-not-on-tile', '入口必须落在触觉砖上，当前格不是触觉砖。', [entrance])
  }
  if (cells[service] !== 'tile') {
    return failure('service-not-on-tile', '服务点必须落在触觉砖上，当前格不是触觉砖。', [service])
  }
  if (entrance === service) {
    return failure('endpoints-coincide', '入口与服务点不得重合在同一格。', [entrance])
  }

  const component = findComponent(entrance, cells)
  const connected = component[service] === 1

  // 入口分量之外的触觉砖：断路对侧路线或现场遗留的孤立铺设
  const outsideTiles: number[] = []
  for (let i = 0; i < CELL_COUNT; i += 1) {
    if (cells[i] === 'tile' && component[i] === 0) outsideTiles.push(i)
  }

  // 连通时即便存在孤岛也先算出确定路径并高亮，孤岛保持红色
  let pathCells: number[] = []
  let steps: number | null = null
  if (connected) {
    const found = shortestPath(entrance, service, cells)
    if (found !== null) {
      pathCells = found.path
      steps = found.steps
    }
  }

  if (!connected) {
    return {
      ok: false,
      connected: false,
      issue: {
        code: 'not-connected',
        message: '入口与服务点不连通：路径只允许上下左右穿过触觉砖，请补上断路砖或清除障碍。',
        cells: outsideTiles,
      },
      issueCells: outsideTiles,
      pathCells: [],
      steps: null,
    }
  }

  if (outsideTiles.length > 0) {
    return {
      ok: false,
      connected: true,
      issue: {
        code: 'isolated-tile',
        message: `存在 ${outsideTiles.length} 格与主路线无关的孤立触觉砖，请将其接入路线或清除。`,
        cells: outsideTiles,
      },
      issueCells: outsideTiles,
      pathCells,
      steps,
    }
  }

  return { ok: true, connected: true, issue: null, issueCells: [], pathCells, steps }
}

function failure(code: IssueCode, message: string, issueCells: number[] = []): VerificationResult {
  return {
    ok: false,
    connected: false,
    issue: { code, message, cells: issueCells },
    issueCells,
    pathCells: [],
    steps: null,
  }
}

/**
 * 应用一次编辑，返回新状态；若该编辑不改变任何内容则原样返回（引用相等），
 * 便于调用方决定是否压入撤销栈。纯函数，便于单测。
 */
export function applyTool(state: GridState, tool: Tool, index: number): GridState {
  if (tool === 'entrance') {
    return state.entrance === index ? state : { ...state, entrance: index }
  }
  if (tool === 'service') {
    return state.service === index ? state : { ...state, service: index }
  }
  if (state.cells[index] === tool) return state
  const cells = state.cells.slice()
  cells[index] = tool
  return { ...state, cells }
}
