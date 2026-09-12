import { describe, expect, it } from 'vitest';
import {
  analyze,
  describeError,
  expectedPage,
  expectedSheetPages,
  formatPosition,
  isValidTotalPages,
  nestingChain,
  parsePage,
  sheetCount,
  validateEntries,
  type SheetRaw,
} from './signature';

/** 按公式生成一叠完全正确的录入 */
function correctSheets(n: number): SheetRaw[] {
  return Array.from({ length: sheetCount(n) }, (_, k) => {
    const [fl, fr, bl, br] = expectedSheetPages(n, k);
    return {
      frontLeft: String(fl),
      frontRight: String(fr),
      backLeft: String(bl),
      backRight: String(br),
    };
  });
}

describe('总页数规则', () => {
  it('仅接受 4–64 之间 4 的倍数', () => {
    for (const ok of [4, 8, 12, 16, 20, 32, 48, 64]) {
      expect(isValidTotalPages(ok)).toBe(true);
    }
    for (const bad of [0, 1, 2, 3, 5, 6, 7, 9, 10, 62, 63, 65, 66, 68, 100, -4, 4.5, Number.NaN]) {
      expect(isValidTotalPages(bad)).toBe(false);
    }
  });

  it('纸张数 = N/4，非法 N 抛错', () => {
    expect(sheetCount(4)).toBe(1);
    expect(sheetCount(16)).toBe(4);
    expect(sheetCount(64)).toBe(16);
    expect(() => sheetCount(10)).toThrow(RangeError);
    expect(() => sheetCount(66)).toThrow(RangeError);
  });
});

describe('页码公式', () => {
  it('按 N-2k、1+2k、2+2k、N-1-2k 生成', () => {
    expect(expectedSheetPages(16, 0)).toEqual([16, 1, 2, 15]);
    expect(expectedSheetPages(16, 1)).toEqual([14, 3, 4, 13]);
    expect(expectedSheetPages(16, 2)).toEqual([12, 5, 6, 11]);
    expect(expectedSheetPages(16, 3)).toEqual([10, 7, 8, 9]);
    expect(expectedSheetPages(8, 1)).toEqual([6, 3, 4, 5]);
    expect(expectedSheetPages(4, 0)).toEqual([4, 1, 2, 3]);
  });

  it('expectedPage 与 expectedSheetPages 逐格一致', () => {
    for (let k = 0; k < sheetCount(16); k++) {
      expect(expectedSheetPages(16, k)).toEqual([0, 1, 2, 3].map((i) => expectedPage(16, k, i)));
    }
    expect(() => expectedPage(16, 0, 4)).toThrow(RangeError);
  });

  it('全部合法 N 下，所有期望页码恰好覆盖 1..N 各一次', () => {
    for (let n = 4; n <= 64; n += 4) {
      const all: number[] = [];
      for (let k = 0; k < sheetCount(n); k++) all.push(...expectedSheetPages(n, k));
      expect(all.sort((a, b) => a - b)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    }
  });

  it('同一张纸的正面左右之和、反面左右之和均为 N+1', () => {
    for (let n = 4; n <= 64; n += 4) {
      for (let k = 0; k < sheetCount(n); k++) {
        const [fl, fr, bl, br] = expectedSheetPages(n, k);
        expect(fl + fr).toBe(n + 1);
        expect(bl + br).toBe(n + 1);
      }
    }
  });

  it('最内张的正面右与反面左是帖心的相连页码', () => {
    for (let n = 4; n <= 64; n += 4) {
      const k = sheetCount(n) - 1;
      const [, frontRight, backLeft] = expectedSheetPages(n, k);
      expect(backLeft - frontRight).toBe(1);
    }
  });
});

describe('parsePage', () => {
  it('空串与纯空白 → missing', () => {
    expect(parsePage('')).toEqual({ ok: false, kind: 'missing' });
    expect(parsePage('   ')).toEqual({ ok: false, kind: 'missing' });
  });

  it('小数、字母、科学计数法等 → non-integer', () => {
    for (const raw of ['1.5', 'abc', '1e2', '1,000', '页3', '3.0', '--1']) {
      expect(parsePage(raw)).toEqual({ ok: false, kind: 'non-integer' });
    }
  });

  it('整数字符串 → 数值（容忍首尾空白）', () => {
    expect(parsePage('12')).toEqual({ ok: true, value: 12 });
    expect(parsePage(' 7 ')).toEqual({ ok: true, value: 7 });
    expect(parsePage('-3')).toEqual({ ok: true, value: -3 });
  });
});

describe('结构校验（只定位字段，不判对错）', () => {
  it('合法录入无错误', () => {
    expect(validateEntries(8, correctSheets(8))).toEqual([]);
    expect(validateEntries(64, correctSheets(64))).toEqual([]);
  });

  it('缺失：给出字段位置', () => {
    const sheets = correctSheets(8);
    sheets[1].backLeft = '';
    const errors = validateEntries(8, sheets);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ sheetIndex: 1, field: 'backLeft', kind: 'missing' });
    expect(formatPosition(errors[0])).toBe('第 2 张 · 反面左');
    expect(describeError(errors[0], 8)).toBe('未填写');
  });

  it('非整数：按张→格顺序报告', () => {
    const sheets = correctSheets(8);
    sheets[0].frontRight = '1.5';
    sheets[1].frontLeft = 'abc';
    const errors = validateEntries(8, sheets);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toMatchObject({ sheetIndex: 0, field: 'frontRight', kind: 'non-integer' });
    expect(errors[1]).toMatchObject({ sheetIndex: 1, field: 'frontLeft', kind: 'non-integer' });
  });

  it('越界：0 与 N+1 均被指出并给出合法范围', () => {
    const sheets = correctSheets(8);
    sheets[0].frontLeft = '9';
    sheets[1].backRight = '0';
    const errors = validateEntries(8, sheets);
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.kind === 'out-of-range')).toBe(true);
    expect(errors[0]).toMatchObject({ sheetIndex: 0, field: 'frontLeft', value: 9 });
    expect(errors[1]).toMatchObject({ sheetIndex: 1, field: 'backRight', value: 0 });
    expect(describeError(errors[0], 8)).toContain('1–8');
  });

  it('重复：冲突双方都被标出并互相引用', () => {
    const sheets = correctSheets(8);
    sheets[1].frontRight = '1'; // 与 sheets[0].frontRight 重复
    const errors = validateEntries(8, sheets);
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.kind === 'duplicate' && e.value === 1)).toBe(true);
    expect(errors[0]).toMatchObject({ sheetIndex: 0, field: 'frontRight' });
    expect(errors[1]).toMatchObject({ sheetIndex: 1, field: 'frontRight' });
    expect(errors[0].peers).toEqual([{ sheetIndex: 1, field: 'frontRight' }]);
    expect(describeError(errors[0], 8)).toContain('第 2 张 · 正面右');
  });

  it('同一页码重复三次 → 三个字段全部标出', () => {
    const sheets = correctSheets(8);
    sheets[0].backLeft = '1';
    sheets[1].frontRight = '1';
    const errors = validateEntries(8, sheets);
    expect(errors).toHaveLength(3);
    expect(errors.every((e) => e.kind === 'duplicate')).toBe(true);
  });
});

describe('核样判定', () => {
  it('结构不合法 → invalid，不进入对错判定', () => {
    const sheets = correctSheets(8);
    sheets[0].frontLeft = '';
    const r = analyze(8, sheets);
    expect(r.status).toBe('invalid');
    if (r.status === 'invalid') expect(r.errors).toHaveLength(1);
  });

  it('全部匹配 → firstMismatchIndex 为 null，每张四格皆相符', () => {
    const r = analyze(16, correctSheets(16));
    if (r.status !== 'valid') throw new Error('应结构合法');
    expect(r.firstMismatchIndex).toBeNull();
    expect(r.sheets).toHaveLength(4);
    expect(r.sheets.every((s) => s.match)).toBe(true);
    expect(r.sheets[2].cells.map((c) => c.expected)).toEqual([12, 5, 6, 11]);
  });

  it('中间两张对调 → 首张不符纸为较外那张，四格全部不符', () => {
    const sheets = correctSheets(16);
    [sheets[1], sheets[2]] = [sheets[2], sheets[1]];
    const r = analyze(16, sheets);
    if (r.status !== 'valid') throw new Error('应结构合法');
    expect(r.firstMismatchIndex).toBe(1);
    expect(r.sheets[0].match).toBe(true);
    expect(r.sheets[1].match).toBe(false);
    expect(r.sheets[1].cells.every((c) => !c.match)).toBe(true);
    expect(r.sheets[1].cells.map((c) => c.actual)).toEqual([12, 5, 6, 11]);
    expect(r.sheets[1].cells.map((c) => c.expected)).toEqual([14, 3, 4, 13]);
  });

  it('有一面翻反 → 首张不符纸保留四格差异，两格相符两格不符', () => {
    const sheets = correctSheets(8);
    sheets[0].backLeft = '7';
    sheets[0].backRight = '2';
    const r = analyze(8, sheets);
    if (r.status !== 'valid') throw new Error('应结构合法');
    expect(r.firstMismatchIndex).toBe(0);
    expect(r.sheets[0].cells.map((c) => c.match)).toEqual([true, true, false, false]);
    expect(r.sheets[0].cells[2]).toMatchObject({ expected: 2, actual: 7 });
    expect(r.sheets[0].cells[3]).toMatchObject({ expected: 7, actual: 2 });
  });

  it('仅最内张出错 → 首张不符纸就是最内张', () => {
    const sheets = correctSheets(16);
    sheets[3].frontLeft = '9';
    sheets[3].backRight = '10'; // 互换以保持结构合法（无重复）
    const r = analyze(16, sheets);
    if (r.status !== 'valid') throw new Error('应结构合法');
    expect(r.firstMismatchIndex).toBe(3);
    expect(r.sheets.slice(0, 3).every((s) => s.match)).toBe(true);
  });
});

describe('套页链', () => {
  it('从最外张到最内张完整列出', () => {
    expect(nestingChain(8)).toEqual([
      { index: 0, pages: [8, 1, 2, 7] },
      { index: 1, pages: [6, 3, 4, 5] },
    ]);
    expect(nestingChain(64)).toHaveLength(16);
    expect(nestingChain(4)).toEqual([{ index: 0, pages: [4, 1, 2, 3] }]);
  });
});
