<script setup lang="ts">
import { computed, ref } from 'vue'
import BoardView from './components/BoardView.vue'
import {
  applyTool,
  countTiles,
  createEmptyState,
  verifyGrid,
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

function paint(payload: { index: number; viaDrag: boolean }) {
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
        <BoardView :state="state" :result="result" @paint="paint" />
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
      </div>
    </aside>
  </div>
</template>
