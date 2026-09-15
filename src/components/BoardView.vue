<script setup lang="ts">
import { COLS, ROWS, colOf, rowOf, type GridState, type VerificationResult } from '../domain/grid'

const props = defineProps<{
  state: GridState
  result: VerificationResult
}>()

const emit = defineEmits<{
  (e: 'paint', payload: { index: number; viaDrag: boolean }): void
}>()

const CELL = 56
const WIDTH = COLS * CELL
const HEIGHT = ROWS * CELL

function x(index: number): number {
  return colOf(index) * CELL
}

function y(index: number): number {
  return rowOf(index) * CELL
}

const indices = Array.from({ length: COLS * ROWS }, (_, i) => i)

function onDown(index: number, event: PointerEvent) {
  event.preventDefault()
  emit('paint', { index, viaDrag: false })
}

function onEnter(index: number) {
  // 仅在按住按键拖画时触发；端点工具不响应拖画（避免端点被一路拖走）
  if (dragButtons !== 0) emit('paint', { index, viaDrag: true })
}

// pointer 捕获在 SVG 各格间切换不稳定，改用全局按键位图
let dragButtons = 0
function onPointerDown() {
  dragButtons = 1
  window.addEventListener('pointerup', onPointerUp, { once: true })
}
function onPointerUp() {
  dragButtons = 0
}

function onKey(index: number, event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('paint', { index, viaDrag: false })
  }
}

function label(index: number): string {
  return `第 ${rowOf(index) + 1} 行，第 ${colOf(index) + 1} 列`
}

function pathPoints(): string {
  return props.result.pathCells
    .map((i) => String(x(i) + CELL / 2) + ',' + String(y(i) + CELL / 2))
    .join(' ')
}

const viewBox = '0 0 ' + WIDTH + ' ' + HEIGHT
</script>

<template>
  <svg
    class="board-svg"
    :viewBox="viewBox"
    role="grid"
    aria-label="12 列 8 行触觉砖核验栅格"
    @pointerdown="onPointerDown"
  >
    <defs>
      <!-- 触觉砖：黄底圆点（盲道触感铺砖示意） -->
      <pattern id="tileDots" :width="9.4" :height="9.4" patternUnits="userSpaceOnUse">
        <rect width="9.4" height="9.4" fill="#f5c542" />
        <circle cx="2.6" cy="2.6" r="1.7" fill="#b98a12" />
        <circle cx="7.3" cy="7.3" r="1.7" fill="#b98a12" />
      </pattern>
      <!-- 障碍物：斜纹 -->
      <pattern id="obstacleHatch" :width="10" :height="10" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
        <rect width="10" height="10" fill="#475569" />
        <rect width="4" height="10" fill="#334155" />
      </pattern>
    </defs>

    <rect :x="0" :y="0" :width="WIDTH" :height="HEIGHT" fill="#0f172a" />

    <!-- 高亮路径：四邻接折线（轴对齐，禁止对角由数据保证） -->
    <polyline
      v-if="result.pathCells.length > 1"
      :points="pathPoints()"
      fill="none"
      stroke="#60a5fa"
      stroke-width="15"
      stroke-linecap="round"
      stroke-linejoin="round"
      opacity="0.55"
      data-testid="path-line"
    />

    <template v-for="i in indices" :key="i">
      <g
        class="cell"
        role="gridcell"
        :tabindex="0"
        :data-testid="`cell-${i}`"
        :data-kind="state.cells[i]"
        :data-issue="result.issueCells.includes(i) ? '1' : '0'"
        :data-path="result.pathCells.includes(i) ? '1' : '0'"
        :data-entrance="state.entrance === i ? '1' : '0'"
        :data-service="state.service === i ? '1' : '0'"
        :aria-label="label(i)"
        @pointerdown="onDown(i, $event)"
        @pointerenter="onEnter(i)"
        @keydown="onKey(i, $event)"
      >
        <title>{{ label(i) }}</title>
        <!-- 格底 -->
        <rect
          :x="x(i) + 1"
          :y="y(i) + 1"
          :width="CELL - 2"
          :height="CELL - 2"
          rx="5"
          :fill="
            state.cells[i] === 'tile'
              ? 'url(#tileDots)'
              : state.cells[i] === 'obstacle'
                ? 'url(#obstacleHatch)'
                : '#f8fafc'
          "
          :stroke="state.cells[i] === 'empty' ? '#cbd5e1' : '#94a3b8'"
          stroke-width="1"
        />

        <!-- 路径格覆盖层 -->
        <rect
          v-if="result.pathCells.includes(i)"
          :x="x(i) + 5"
          :y="y(i) + 5"
          :width="CELL - 10"
          :height="CELL - 10"
          rx="8"
          fill="rgba(37, 99, 235, 0.28)"
          stroke="#2563eb"
          stroke-width="2"
          pointer-events="none"
        />

        <!-- 问题格：红色标记（孤岛 / 断路对侧 / 问题端点） -->
        <g v-if="result.issueCells.includes(i)" pointer-events="none">
          <rect
            :x="x(i) + 3.5"
            :y="y(i) + 3.5"
            :width="CELL - 7"
            :height="CELL - 7"
            rx="7"
            fill="rgba(239, 68, 68, 0.16)"
            stroke="#ef4444"
            stroke-width="3.5"
            class="issue-ring"
          />
          <text
            :x="x(i) + CELL - 10"
            :y="y(i) + 16"
            text-anchor="middle"
            font-size="15"
            font-weight="700"
            fill="#dc2626"
          >!</text>
        </g>

        <!-- 端点 -->
        <g v-if="state.entrance === i || state.service === i" pointer-events="none">
          <circle
            :cx="x(i) + CELL / 2"
            :cy="y(i) + CELL / 2"
            r="16"
            :fill="state.entrance === i ? '#16a34a' : '#7c3aed'"
            stroke="#f8fafc"
            stroke-width="2.5"
          />
          <text
            :x="x(i) + CELL / 2"
            :y="y(i) + CELL / 2 + 6"
            text-anchor="middle"
            font-size="15"
            font-weight="700"
            fill="#ffffff"
          >{{ state.entrance === i ? '入' : '服' }}</text>
        </g>
      </g>
    </template>
  </svg>
</template>
