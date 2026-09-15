<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import BoardView from './components/BoardView.vue'
import {
  analyzeCutCells,
  applyTool,
  colOf,
  countTiles,
  createEmptyState,
  rowOf,
  verifyGrid,
  type CutCellAnalysis,
  type CutOverlay,
  type GridState,
  type Tool,
} from './domain/grid'

const tools: { id: Tool; label: string; swatch: string }[] = [
  { id: 'empty', label: '空白', swatch: 'empty' },
  { id: 'tile', label: '触觉砖', swatch: 'tile' },
  { id: 'obstacle', label: '障碍物', swatch: 'obstacle' },
  { id: 'entrance', label: '入口', swatch: 'entrance' },
  { id: 'service', label: '服务点', swatch: 'service' },
]

const currentTool = ref<Tool>('tile')

// 撤销栈：仅保存发生实际变化的历史状态
const state = ref<GridState>(createEmptyState())
const past = ref<GridState[]>([])

// 编辑后立即重新核验（computed 随 state 同步刷新）
const result = computed(() => verifyGrid(state.value))
const tileTotal = computed(() => countTiles(state.value))
const canUndo = computed(() => past.value.length > 0)

// —— 单点中断分析：未分析(idle) / 已汇总(summary) / 已选中(selected) 三阶段 ——
const analysisRequested = ref(false)
const selectedCut = ref<number | null>(null)

// 分析只在原核验通过时执行；棋盘任何变化都会使 computed 按当前棋盘重算
const cutAnalysis = computed<CutCellAnalysis | null>(() => {
  if (!analysisRequested.value || !result.value.ok) return null
  return analyzeCutCells(state.value)
})

// 路线编辑、撤销、清空或载入示例都会替换 state：立即清除旧选择
watch(state, () => {
  selectedCut.value = null
})

type CutView =
  | { phase: 'idle'; riskCells: number[] }
  | { phase: 'summary'; riskCells: number[] }
  | { phase: 'selected'; riskCells: number[]; selected: number; affected: number[] }

const cutView = computed<CutView>(() => {
  const analysis = cutAnalysis.value
  if (analysis === null) return { phase: 'idle', riskCells: [] }
  const selected = selectedCut.value
  const at = selected === null ? -1 : analysis.riskCells.indexOf(selected)
  if (selected === null || at === -1) {
    return { phase: 'summary', riskCells: analysis.riskCells }
  }
  return {
    phase: 'selected',
    riskCells: analysis.riskCells,
    selected,
    affected: analysis.affectedCells[at],
  }
})

// 传给棋盘的覆盖层：未分析时不产生任何标记
const cutOverlay = computed<CutOverlay>(() => {
  const view = cutView.value
  if (view.phase === 'selected') {
    return { riskCells: view.riskCells, affectedCells: view.affected, selected: view.selected }
  }
  return { riskCells: view.riskCells, affectedCells: [], selected: null }
})

function toggleCutAnalysis() {
  analysisRequested.value = !analysisRequested.value
  if (!analysisRequested.value) selectedCut.value = null
}

function selectCutCell(index: number) {
  const view = cutView.value
  // 再次点选同一风险格取消选中，否则切换到新选中的格
  selectedCut.value = view.phase === 'selected' && view.selected === index ? null : index
}

function paint(payload: { index: number; viaDrag: boolean }) {
  // 分析进行中点选橙色风险格：切换选中而非绘制（拖画不触发选中）
  if (
    !payload.viaDrag &&
    cutView.value.phase !== 'idle' &&
    cutView.value.riskCells.includes(payload.index)
  ) {
    selectCutCell(payload.index)
    return
  }
  // 端点工具只响应单击，不响应拖画，防止整排被拖成同一个端点
  if (payload.viaDrag && (currentTool.value === 'entrance' || currentTool.value === 'service')) return
  const next = applyTool(state.value, currentTool.value, payload.index)
  if (next === state.value) return
  past.value.push(state.value)
  state.value = next
}

function undo() {
  const previous = past.value.pop()
  if (previous !== undefined) state.value = previous
}

function reset() {
  if (countTiles(state.value) === 0 && state.value.entrance === null && state.value.service === null) return
  past.value.push(state.value)
  state.value = createEmptyState()
}

function loadExample(kind: 'pass' | 'broken') {
  const fresh = createEmptyState()
  // 第 2 行主通道
  for (let c = 0; c < 12; c += 1) fresh.cells[2 * 12 + c] = 'tile'
  if (kind === 'broken') {
    // 第 6 列留一个空格，模拟看似连续实则断路；角落放一块孤立铺设
    fresh.cells[2 * 12 + 6] = 'empty'
    fresh.cells[7 * 12 + 11] = 'tile'
  }
  fresh.entrance = 2 * 12
  fresh.service = 2 * 12 + 11
  past.value.push(state.value)
  state.value = fresh
}
</script>

<template>
  <header class="app-header">
    <h1>触觉引导砖核验板</h1>
    <p>12 列 × 8 行站厅栅格 · 仅四邻接（上下左右）通行 · 所有触觉砖必须同属入口连通分量</p>
  </header>

  <div class="layout">
    <section class="panel">
      <div class="toolbar" role="toolbar" aria-label="编辑工具">
        <button
          v-for="t in tools"
          :key="t.id"
          type="button"
          class="tool-btn"
          :class="{ active: currentTool === t.id }"
          :data-testid="`tool-${t.id}`"
          :aria-pressed="currentTool === t.id"
          @click="currentTool = t.id"
        >
          <span class="swatch" :class="t.swatch" />{{ t.label }}
        </button>
      </div>

      <div class="board-wrap">
        <BoardView :state="state" :result="result" :cut="cutOverlay" @paint="paint" />
      </div>
    </section>

    <aside class="side">
      <div
        class="verdict"
        :class="result.ok ? 'ok' : 'bad'"
        :data-testid="result.ok ? 'verdict-ok' : 'verdict-bad'"
      >
        <div class="verdict-title">
          <span>{{ result.ok ? '✓' : '✕' }}</span>
          <span>{{ result.ok ? '核验通过' : '核验不通过' }}</span>
        </div>
        <div class="reason" data-testid="verdict-reason">
          {{
            result.ok
              ? '两端点四邻接连通，且全部触觉砖均属于入口所在连通分量。'
              : result.issue?.message
          }}
        </div>
      </div>

      <section class="cut-panel" aria-label="单点中断分析">
        <button
          type="button"
          class="tool-btn cut-toggle"
          :class="{ active: analysisRequested }"
          data-testid="btn-cut-analysis"
          :aria-pressed="analysisRequested"
          @click="toggleCutAnalysis"
        >⚠ 单点中断分析</button>

        <p v-if="!analysisRequested" class="cut-note" data-testid="cut-hint">
          核验通过后可启动分析：找出被临时封闭后会切断入口与服务点的单块非端点触觉砖。
        </p>
        <p v-else-if="!result.ok" class="cut-note warn" data-testid="cut-blocked">
          原核验未通过：请先修复上述核验问题，恢复通过后分析结果会按当前棋盘自动重算。
        </p>
        <template v-else>
          <p class="cut-note" data-testid="cut-summary">
            <template v-if="cutView.riskCells.length > 0">
              共 {{ cutView.riskCells.length }} 格风险格（橙色标记）：封闭任一格即切断入口与服务点，点选橙色格预览受影响范围。
            </template>
            <template v-else>
              无风险格：封闭任意单块非端点触觉砖，入口与服务点依然保持连通。
            </template>
          </p>
          <p v-if="cutView.phase === 'selected'" class="cut-note detail" data-testid="cut-detail">
            封闭第 {{ rowOf(cutView.selected) + 1 }} 行第 {{ colOf(cutView.selected) + 1 }} 列后，
            服务点一侧 {{ cutView.affected.length }} 格不可达（含服务点）；再次点选该格可取消。
          </p>
        </template>
      </section>

      <div class="stats">
        <div class="stat">
          <div class="label">触觉砖总数</div>
          <div class="value" data-testid="stat-tiles">{{ tileTotal }}</div>
        </div>
        <div class="stat">
          <div class="label">入口→服务点最少步数</div>
          <div class="value" data-testid="stat-steps">{{ result.steps ?? '—' }}</div>
        </div>
        <div class="stat full">
          <div class="label">连通状态</div>
          <div class="value" :style="{ fontSize: '15px', color: result.connected ? '#22c55e' : '#ef4444' }">
            {{ result.connected ? '两端点已连通' : '两端点未连通' }}
          </div>
        </div>
      </div>

      <div class="actions">
        <button
          type="button"
          class="tool-btn"
          data-testid="btn-undo"
          :disabled="!canUndo"
          @click="undo"
        >↩ 撤销最近一步</button>
        <button type="button" class="tool-btn" data-testid="btn-reset" @click="reset">清空</button>
      </div>

      <div class="actions">
        <button type="button" class="tool-btn" data-testid="btn-example-broken" @click="loadExample('broken')">
          断路示例
        </button>
        <button type="button" class="tool-btn" data-testid="btn-example-pass" @click="loadExample('pass')">
          完整示例
        </button>
      </div>

      <div class="legend">
        <p>
          <strong>规则：</strong>入口与服务点必须各落在一格触觉砖上且不得重合；
          路径只允许上下左右穿过触觉砖，斜对角不算连接；
          所有触觉砖都必须属于入口所在连通分量，现场遗留的孤立铺设会被标红。
        </p>
        <p><strong>操作：</strong>选择工具后单击格位，砖/障碍/空白支持按住拖画。</p>
        <p>
          <strong>单点中断分析：</strong>核验通过后启动，橙色环标记风险格；
          点选橙色格预览服务点一侧影响区（半透明橙），再次点选取消；
          分析进行中如需编辑橙色格本身，请先关闭分析。
        </p>
      </div>
    </aside>
  </div>
</template>
