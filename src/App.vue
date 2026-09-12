<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import SheetCard from './components/SheetCard.vue';
import {
  FIELD_LABELS,
  MAX_TOTAL_PAGES,
  MIN_TOTAL_PAGES,
  analyze,
  blankSheet,
  describeError,
  formatPosition,
  isValidTotalPages,
  nestingChain,
  sheetCount,
  type AnalysisResult,
  type SheetRaw,
  type SheetVerdict,
} from './core/signature';

const totalPagesInput = ref('16');
const totalPages = ref(0);
const totalPagesError = ref('');
const sheets = ref<SheetRaw[]>([]);
const result = ref<AnalysisResult | null>(null);

function generate(): void {
  const text = totalPagesInput.value.trim();
  const n = Number(text);
  if (!/^\d+$/.test(text) || !isValidTotalPages(n)) {
    totalPagesError.value = `总页数 N 须为 ${MIN_TOTAL_PAGES}–${MAX_TOTAL_PAGES} 之间 4 的倍数`;
    totalPages.value = 0;
    sheets.value = [];
    result.value = null;
    return;
  }
  totalPagesError.value = '';
  totalPages.value = n;
  sheets.value = Array.from({ length: sheetCount(n) }, () => blankSheet());
  result.value = null;
}

function runAnalysis(): void {
  if (totalPages.value === 0 || sheets.value.length === 0) return;
  result.value = analyze(totalPages.value, sheets.value);
}

function clearEntries(): void {
  for (const sheet of sheets.value) {
    sheet.frontLeft = '';
    sheet.frontRight = '';
    sheet.backLeft = '';
    sheet.backRight = '';
  }
  result.value = null;
}

// 任何录入改动都会作废旧结论，避免展示过期判定
watch(sheets, () => {
  result.value = null;
}, { deep: true });

const mismatchSheet = computed<SheetVerdict | null>(() => {
  const r = result.value;
  if (!r || r.status !== 'valid' || r.firstMismatchIndex === null) return null;
  return r.sheets[r.firstMismatchIndex];
});

const chain = computed(() =>
  result.value?.status === 'valid' && result.value.firstMismatchIndex === null
    ? nestingChain(totalPages.value)
    : [],
);
</script>

<template>
  <header class="site-head">
    <h1>锁线装帧核样台</h1>
    <p>
      套帖规则：总页数 N（{{ MIN_TOTAL_PAGES }}–{{ MAX_TOTAL_PAGES }} 且为 4 的倍数），共 N/4 张纸，
      由外至内 k = 0 起；第 k 张四格唯一期望为
      <code>N−2k</code>、<code>1+2k</code>、<code>2+2k</code>、<code>N−1−2k</code>。
    </p>
  </header>

  <section class="panel" aria-label="参数">
    <div class="row">
      <label for="total-pages">总页数 N</label>
      <input
        id="total-pages"
        v-model="totalPagesInput"
        data-testid="total-pages"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        @keyup.enter="generate"
      />
      <button type="button" data-testid="generate" @click="generate">生成纸堆</button>
      <span class="hint">{{ MIN_TOTAL_PAGES }}–{{ MAX_TOTAL_PAGES }} 之间 4 的倍数，共 N/4 张纸</span>
    </div>
    <p v-if="totalPagesError" class="error-text" data-testid="total-pages-error" role="alert">
      {{ totalPagesError }}
    </p>
  </section>

  <template v-if="sheets.length > 0">
    <section class="panel" aria-label="纸堆">
      <div class="row actions">
        <button type="button" class="primary" data-testid="analyze" @click="runAnalysis">开始核样</button>
        <button type="button" data-testid="clear" @click="clearEntries">清空实测</button>
        <span class="hint">共 {{ sheets.length }} 张纸（k = 0 … {{ sheets.length - 1 }}，由外至内嵌套）</span>
      </div>
      <div class="stack">
        <SheetCard :sheets="sheets" :index="0" :total-pages="totalPages" :result="result" />
      </div>
    </section>

    <section v-if="result" class="panel" data-testid="conclusion-panel" aria-label="核样结论">
      <!-- 结构不合法：只列字段位置，不产生成败结论 -->
      <div v-if="result.status === 'invalid'" class="verdict invalid">
        <h2 data-testid="conclusion-title">录入有误 · 暂无结论</h2>
        <p>以下字段需先修正；修正前不产生成败结论。</p>
        <ul class="error-list" data-testid="error-list">
          <li v-for="(err, i) in result.errors" :key="i" :data-testid="`error-${i}`">
            <strong>{{ formatPosition(err) }}</strong>：{{ describeError(err, totalPages) }}
          </li>
        </ul>
      </div>

      <!-- 结构合法但存在不符纸：定位首张不符纸并保留其四格差异 -->
      <div v-else-if="mismatchSheet" class="verdict mismatch">
        <h2 data-testid="conclusion-title">
          不可锁线 · 首张不符纸为第 {{ mismatchSheet.index + 1 }} 张（k = {{ mismatchSheet.index }}，由外至内）
        </h2>
        <p>该纸四格差异如下（实测 ↔ 期望）：</p>
        <table class="diff" data-testid="diff-table">
          <thead>
            <tr>
              <th>格位</th>
              <th>实测</th>
              <th>期望</th>
              <th>判定</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="cell in mismatchSheet.cells"
              :key="cell.field"
              :class="{ bad: !cell.match }"
              :data-testid="`diff-${cell.field}`"
            >
              <td>{{ FIELD_LABELS[cell.field] }}</td>
              <td>{{ cell.actual }}</td>
              <td>{{ cell.expected }}</td>
              <td>{{ cell.match ? '✓ 相符' : '✗ 不符' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 全部匹配：完整套页链 + 唯一可锁线结论 -->
      <div v-else class="verdict ok">
        <h2 data-testid="conclusion-title">可锁线</h2>
        <p>全部 {{ sheets.length }} 张纸四格均与期望一致，唯一结论：本帖可锁线。套页链（最外 → 最内）：</p>
        <ol class="chain" data-testid="chain">
          <li v-for="link in chain" :key="link.index" :data-testid="`chain-${link.index}`">
            <span class="chain-name">
              第 {{ link.index + 1 }} 张
              <em v-if="link.index === 0">（最外）</em>
              <em v-if="link.index === chain.length - 1">（最内）</em>
            </span>
            <code>{{ link.pages.join(' · ') }}</code>
            <span v-if="link.index < chain.length - 1" class="arrow" aria-hidden="true">↓</span>
          </li>
        </ol>
      </div>
    </section>
  </template>
</template>

<style scoped>
.site-head h1 {
  margin: 0 0 6px;
  font-size: 22px;
}

.site-head p {
  margin: 0 0 16px;
  color: #5c5340;
  font-size: 14px;
}

.panel {
  border: 1px solid #d8cdb0;
  border-radius: 10px;
  background: #fffef9;
  padding: 14px 16px;
  margin-bottom: 16px;
}

.row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.row label {
  font-weight: 600;
}

.row input {
  width: 90px;
  padding: 6px 8px;
  border: 1px solid #c4b995;
  border-radius: 6px;
  font-size: 14px;
  text-align: center;
}

button {
  padding: 6px 14px;
  border: 1px solid #b7ab8d;
  border-radius: 6px;
  background: #f4eedd;
  cursor: pointer;
  font-size: 14px;
  color: #41392a;
}

button:hover {
  background: #eae1c8;
}

button.primary {
  background: #2c5a8a;
  border-color: #2c5a8a;
  color: #fff;
}

button.primary:hover {
  background: #234a72;
}

.hint {
  font-size: 13px;
  color: #8a7f63;
}

.error-text {
  color: #b3232a;
  margin: 8px 0 0;
  font-size: 14px;
}

.actions {
  margin-bottom: 12px;
}

.verdict h2 {
  margin: 0 0 8px;
  font-size: 18px;
}

.verdict.invalid h2 {
  color: #b26a00;
}

.verdict.mismatch h2 {
  color: #b3232a;
}

.verdict.ok h2 {
  color: #1c7a34;
}

.error-list {
  margin: 8px 0 0;
  padding-left: 20px;
}

.error-list li {
  margin: 4px 0;
}

table.diff {
  border-collapse: collapse;
  margin-top: 8px;
}

table.diff th,
table.diff td {
  border: 1px solid #d8cdb0;
  padding: 6px 14px;
  text-align: center;
  font-size: 14px;
}

table.diff th {
  background: #f4eedd;
}

table.diff tr.bad td {
  background: #fdf0f0;
  color: #b3232a;
  font-weight: 600;
}

.chain {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
}

.chain li {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 6px 0;
}

.chain-name {
  min-width: 130px;
  font-weight: 600;
}

.chain-name em {
  font-style: normal;
  font-weight: normal;
  color: #8a7f63;
  font-size: 12px;
}

.chain code {
  background: #f4eedd;
  border-radius: 4px;
  padding: 2px 8px;
}

.chain .arrow {
  color: #8a7f63;
}
</style>
