import { describe, expect, it } from 'vitest';
import {
  parseBatchText,
  parsePage,
  type BatchParseResult,
  type SheetRaw,
} from './signature';

/**
 * 模拟 App 的原子应用契约：只有解析完全成功时才整体构造新录入并替换；
 * 失败时原数组与其中的字符串一个字节都不能变。
 */
function applyBatch(existing: SheetRaw[], text: string): { applied: boolean; result: BatchParseResult } {
  const snapshot = existing.map((s) => ({ ...s }));
  const parsed = parseBatchText(text, existing.length);
  if (!parsed.ok) {
    // 失败路径：显式断言未发生写入
    expect(existing).toEqual(snapshot);
    return { applied: false, result: parsed };
  }
  const next: SheetRaw[] = Array.from({ length: existing.length }, () => ({
    frontLeft: '',
    frontRight: '',
    backLeft: '',
    backRight: '',
  }));
  for (const cell of parsed.cells) next[cell.row][cell.field] = cell.raw;
  existing = next;
  return { applied: true, result: parsed };
}

describe('parseBatchText 分隔符与行序', () => {
  it('空格分隔：每行四项，按行映射到由外至内的纸张', () => {
    const text = '16 1 2 15\n14 3 4 13\n12 5 6 11\n10 7 8 9';
    const r = parseBatchText(text, 4);
    if (!r.ok) throw new Error('应解析成功');
    expect(r.cells).toHaveLength(16);
    expect(r.cells.slice(0, 4).map((c) => c.value)).toEqual([16, 1, 2, 15]);
    expect(r.cells.slice(12).map((c) => c.value)).toEqual([10, 7, 8, 9]);
    // 行列位置
    expect(r.cells[0]).toMatchObject({ row: 0, column: 0, field: 'frontLeft', raw: '16' });
    expect(r.cells[3]).toMatchObject({ row: 0, column: 3, field: 'backRight', raw: '15' });
    expect(r.cells[12 + 2]).toMatchObject({ row: 3, column: 2, field: 'backLeft', raw: '8' });
  });

  it('制表符分隔同样接受，并保留逐格 raw 原文', () => {
    const text = '8\t1\t2\t7\n6\t3\t4\t5';
    const r = parseBatchText(text, 2);
    if (!r.ok) throw new Error('应解析成功');
    expect(r.cells.map((c) => c.value)).toEqual([8, 1, 2, 7, 6, 3, 4, 5]);
    expect(r.cells[4]).toMatchObject({ row: 1, column: 0, field: 'frontLeft', raw: '6' });
  });

  it('同一行内空格与制表符可混用；兼容 CRLF/CR 与末尾换行', () => {
    const text = '8 1\t2 7\r\n6 3 4\t5\n';
    const r = parseBatchText(text, 2);
    if (!r.ok) throw new Error('应解析成功');
    expect(r.cells.map((c) => c.value)).toEqual([8, 1, 2, 7, 6, 3, 4, 5]);
  });

  it('容忍整行首尾任意空白；行内连续分隔符产生空项', () => {
    const ok = parseBatchText('   16 1 2 15  \t', 1);
    if (!ok.ok) throw new Error('整行首尾空白应被容忍');
    expect(ok.cells.map((c) => c.value)).toEqual([16, 1, 2, 15]);
    expect(ok.cells.map((c) => c.raw)).toEqual(['16', '1', '2', '15']);

    // 行内两个空格是两个分隔符 → 五个 token → 列数不符
    const tooMany = parseBatchText('16  1 2 15', 1);
    expect(tooMany.ok).toBe(false);
    if (!tooMany.ok) expect(tooMany.problem.kind).toBe('column-count');
  });

  it('成功结果可整体构造出与文本一致的逐格录入', () => {
    const existing: SheetRaw[] = [
      { frontLeft: '', frontRight: '', backLeft: '', backRight: '' },
      { frontLeft: '', frontRight: '', backLeft: '', backRight: '' },
    ];
    const outcome = applyBatch(existing, '8 1 2 7\n6 3 4 5');
    expect(outcome.applied).toBe(true);
    if (outcome.result.ok) {
      const built: SheetRaw[] = Array.from({ length: 2 }, () => ({
        frontLeft: '',
        frontRight: '',
        backLeft: '',
        backRight: '',
      }));
      for (const cell of outcome.result.cells) built[cell.row][cell.field] = cell.raw;
      expect(built).toEqual([
        { frontLeft: '8', frontRight: '1', backLeft: '2', backRight: '7' },
        { frontLeft: '6', frontRight: '3', backLeft: '4', backRight: '5' },
      ]);
    }
  });
});

describe('parseBatchText 失败定位（只报首个问题，不产出单元格）', () => {
  it('行数不足 → row-count，定位到首个缺失行（0 基）', () => {
    const r = parseBatchText('16 1 2 15\n14 3 4 13', 4);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.kind).toBe('row-count');
      expect(r.problem.row).toBe(2);
      expect(r.problem.message).toContain('2 行');
      expect(r.problem.message).toContain('4 行');
      expect(r.problem.column).toBeUndefined();
    }
  });

  it('行数多出 → row-count，定位到首个多余物理行', () => {
    const r = parseBatchText('4 1 2 3\n0 0 0 0', 1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.kind).toBe('row-count');
      expect(r.problem.row).toBe(1);
    }
  });

  it('空文本 / 只有换行 / 只有空白 → row-count（都凑不足行数）', () => {
    for (const text of ['', '\n', '\r\n', '   ']) {
      const r = parseBatchText(text, 2);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem.kind).toBe('row-count');
    }
    // 恰好 expectedRows 个空行时，行数列数校验才会介入
    const blankLines = parseBatchText('\n', 1);
    expect(blankLines.ok).toBe(false);
    if (!blankLines.ok) expect(blankLines.problem).toMatchObject({ kind: 'column-count', row: 0, column: 1 });
  });

  it('某行少一项 → column-count，行内定位为第 4 列', () => {
    const r = parseBatchText('8 1 2 7\n6 3 4', 2);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem).toMatchObject({ kind: 'column-count', row: 1, column: 3 });
      expect(r.problem.message).toContain('第 2 行');
    }
  });

  it('某行多一项 → column-count', () => {
    const r = parseBatchText('8 1 2 7 99', 1);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem.kind).toBe('column-count');
      expect(r.problem.row).toBe(0);
    }
  });

  it('连续分隔符造成空项且恰为四项 → empty-cell，定位到具体行列', () => {
    const r = parseBatchText('8 1\t\t7', 1); // tokens: ['8','1','','7']
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem).toMatchObject({ kind: 'empty-cell', row: 0, column: 2 });
      expect(r.problem.message).toContain('第 1 行第 3 项');
      expect(r.problem.message).toContain('反面左');
    }
  });

  it('非整数 → non-integer，定位到首个出现处', () => {
    const r = parseBatchText('8 1 2 7\n6 x 4 5', 2);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.problem).toMatchObject({ kind: 'non-integer', row: 1, column: 1 });
      expect(r.problem.message).toContain('第 2 行第 2 项');
      expect(r.problem.message).toContain('x');
    }
  });

  it('小数 / 科学计数法 → non-integer（与逐格 parsePage 判定一致）', () => {
    for (const bad of ['1.5', '1e2', 'abc']) {
      const r = parseBatchText(`4 1 2 ${bad}`, 1);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.problem.kind).toBe('non-integer');
      expect(parsePage(bad).ok).toBe(false);
    }
  });

  it('首个问题优先：行数问题先于行内问题；列数先于空项；同行由左至右', () => {
    // 行数不对时，即使行内有非整数也只报行数
    let r = parseBatchText('8 x y 7', 2);
    if (r.ok) throw new Error('应失败');
    expect(r.problem.kind).toBe('row-count');

    // 5 项且含空段：列数问题先于空项
    r = parseBatchText('8 1  2 7 9', 1);
    if (r.ok) throw new Error('应失败');
    expect(r.problem.kind).toBe('column-count');

    // 两个非整数，取靠左的
    r = parseBatchText('8 a b 7', 1);
    if (r.ok) throw new Error('应失败');
    expect(r.problem).toMatchObject({ kind: 'non-integer', row: 0, column: 1 });

    // 第二行的问题晚于第一行
    r = parseBatchText('8 1 2 7\n6 x 4 z', 2);
    if (r.ok) throw new Error('应失败');
    expect(r.problem).toMatchObject({ kind: 'non-integer', row: 1, column: 1 });
  });

  it('批量解析不判越界 / 重复：-1 与重复值也算解析成功，交给结构校验', () => {
    const r = parseBatchText('8 1 2 7\n8 1 2 7', 2);
    if (!r.ok) throw new Error('应解析成功');
    expect(r.cells).toHaveLength(8);
  });
});

describe('parseBatchText 失败不写入（原子替换契约）', () => {
  function makeExisting(): SheetRaw[] {
    return [
      { frontLeft: '8', frontRight: '1', backLeft: '2', backRight: '7' },
      { frontLeft: '6', frontRight: '3', backLeft: '4', backRight: '5' },
    ];
  }

  for (const [label, text] of [
    ['行数不足', '8 1 2 7'],
    ['行数多出', '8 1 2 7\n6 3 4 5\n0 0 0 0'],
    ['列数不符', '8 1 2\n6 3 4 5'],
    ['空项', '8 1  7\n6 3 4 5'],
    ['非整数', '8 1 x 7\n6 3 4 5'],
  ] as const) {
    it(`${label}：保留原录入且失败结果不携带任何单元格`, () => {
      const existing = makeExisting();
      const outcome = applyBatch(existing, text);
      expect(outcome.applied).toBe(false);
      expect(outcome.result.ok).toBe(false);
      // 原录入逐格不变
      expect(existing).toEqual(makeExisting());
      expect(existing[0].frontLeft).toBe('8');
      expect(existing[1].backRight).toBe('5');
    });
  }

  it('expectedRows 非法时抛错', () => {
    expect(() => parseBatchText('1 2 3 4', 0)).toThrow(RangeError);
    expect(() => parseBatchText('1 2 3 4', -4)).toThrow(RangeError);
    expect(() => parseBatchText('1 2 3 4', 1.5)).toThrow(RangeError);
  });
});
