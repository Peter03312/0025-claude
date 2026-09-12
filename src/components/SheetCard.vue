<script setup lang="ts">
import { computed, ref } from 'vue';
import {
  FIELD_LABELS,
  FIELD_ORDER,
  expectedSheetPages,
  type AnalysisResult,
  type FieldKey,
  type SheetRaw,
} from '../core/signature';

const props = defineProps<{
  sheets: SheetRaw[];
  index: number;
  totalPages: number;
  result: AnalysisResult | null;
}>();

const expanded = ref(true);

const expected = computed(() => expectedSheetPages(props.totalPages, props.index));
const isInnermost = computed(() => props.index === props.sheets.length - 1);

const sheetVerdict = computed(() => {
  const r = props.result;
  if (!r || r.status !== 'valid') return null;
  return r.sheets[props.index];
});

function cellState(field: FieldKey, fieldIndex: number): 'ok' | 'bad' | 'err' | '' {
  const r = props.result;
  if (!r) return '';
  if (r.status === 'invalid') {
    return r.errors.some((e) => e.sheetIndex === props.index && e.field === field) ? 'err' : '';
  }
  return sheetVerdict.value?.cells[fieldIndex].match ? 'ok' : 'bad';
}
</script>

<template>
  <section class="sheet-card" :data-testid="`sheet-${index}`">
    <header class="sheet-head">
      <button
        type="button"
        class="toggle"
        :data-testid="`toggle-${index}`"
        :aria-expanded="expanded"
        :title="expanded ? '收起内层纸张' : '展开内层纸张'"
        @click="expanded = !expanded"
      >
        {{ expanded ? '▾ 收起' : '▸ 展开' }}
      </button>
      <h3>
        第 {{ index + 1 }} 张
        <small>k = {{ index }}</small>
      </h3>
      <span v-if="index === 0" class="tag outer">最外张</span>
      <span v-if="isInnermost" class="tag inner">最内张</span>
      <span
        v-if="sheetVerdict"
        class="sheet-verdict"
        :class="sheetVerdict.match ? 'ok' : 'bad'"
        :data-testid="`verdict-${index}`"
      >
        {{ sheetVerdict.match ? '✓ 四格相符' : '✗ 存在不符' }}
      </span>
    </header>

    <div class="cells">
      <div
        v-for="(field, i) in FIELD_ORDER"
        :key="field"
        class="cell"
        :class="cellState(field, i)"
        :data-testid="`cell-${index}-${field}`"
      >
        <label :for="`input-${index}-${field}`">{{ FIELD_LABELS[field] }}</label>
        <input
          :id="`input-${index}-${field}`"
          v-model="sheets[index][field]"
          :data-testid="`input-${index}-${field}`"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="实测"
        />
        <span class="expected" :data-testid="`expected-${index}-${field}`">期望 {{ expected[i] }}</span>
      </div>
    </div>

    <div v-show="expanded" class="children" :data-testid="`children-${index}`">
      <SheetCard
        v-if="index + 1 < sheets.length"
        :sheets="sheets"
        :index="index + 1"
        :total-pages="totalPages"
        :result="result"
      />
      <p v-else class="core">— 帖心：第 {{ index + 1 }} 张为最内张 —</p>
    </div>
  </section>
</template>

<style scoped>
.sheet-card {
  border: 1px solid #c9bfa8;
  border-radius: 8px;
  background: #fffdf6;
  padding: 10px 12px;
}

.sheet-head {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.sheet-head h3 {
  margin: 0;
  font-size: 15px;
}

.sheet-head small {
  color: #8a7f63;
  font-weight: normal;
  margin-left: 4px;
}

.toggle {
  border: 1px solid #b7ab8d;
  background: #f4eedd;
  border-radius: 6px;
  padding: 2px 8px;
  cursor: pointer;
  font-size: 12px;
  color: #5c5340;
}

.toggle:hover {
  background: #eae1c8;
}

.tag {
  font-size: 11px;
  border-radius: 999px;
  padding: 1px 8px;
}

.tag.outer {
  background: #e3ecf7;
  color: #2c5a8a;
}

.tag.inner {
  background: #f7e3e3;
  color: #8a2c2c;
}

.sheet-verdict {
  margin-left: auto;
  font-size: 13px;
}

.sheet-verdict.ok {
  color: #1c7a34;
}

.sheet-verdict.bad {
  color: #b3232a;
  font-weight: 600;
}

.cells {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.cell {
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid #ddd3ba;
  border-radius: 6px;
  padding: 6px 8px;
  background: #fff;
}

.cell label {
  font-size: 13px;
  color: #5c5340;
  white-space: nowrap;
}

.cell input {
  width: 56px;
  padding: 4px 6px;
  border: 1px solid #c4b995;
  border-radius: 4px;
  font-size: 14px;
  text-align: center;
}

.cell .expected {
  margin-left: auto;
  font-size: 12px;
  color: #8a7f63;
  white-space: nowrap;
}

.cell.ok {
  border-color: #4caf6d;
  background: #f0f9f2;
}

.cell.bad {
  border-color: #d32f2f;
  background: #fdf0f0;
}

.cell.bad input {
  border-color: #d32f2f;
}

.cell.err {
  border-color: #e6a23c;
  background: #fdf7ea;
}

.cell.err input {
  border-color: #e6a23c;
}

.children {
  margin-top: 10px;
  margin-left: 6px;
  padding-left: 12px;
  border-left: 3px solid #d8cdb0;
}

.core {
  margin: 4px 0;
  font-size: 12px;
  color: #8a7f63;
  text-align: center;
}
</style>
