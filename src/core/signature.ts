/**
 * 锁线装帧套帖核样核心逻辑（纯函数，无 UI、无网络、无后端依赖）。
 *
 * 规则：总页数 N 只能是 4–64 之间 4 的倍数，共 N/4 张纸。
 * 实体纸由外至内编号 k = 0 … N/4-1，第 k 张依次录入
 * 正面左、正面右、反面左、反面右，其唯一期望值为：
 *   正面左 = N - 2k
 *   正面右 = 1 + 2k
 *   反面左 = 2 + 2k
 *   反面右 = N - 1 - 2k
 */

export const MIN_TOTAL_PAGES = 4;
export const MAX_TOTAL_PAGES = 64;

export type FieldKey = 'frontLeft' | 'frontRight' | 'backLeft' | 'backRight';

/** 录入顺序：正面左 → 正面右 → 反面左 → 反面右 */
export const FIELD_ORDER: readonly FieldKey[] = ['frontLeft', 'frontRight', 'backLeft', 'backRight'];

export const FIELD_LABELS: Record<FieldKey, string> = {
  frontLeft: '正面左',
  frontRight: '正面右',
  backLeft: '反面左',
  backRight: '反面右',
};

/** 一张纸上四格的原始录入（未解析的文本） */
export interface SheetRaw {
  frontLeft: string;
  frontRight: string;
  backLeft: string;
  backRight: string;
}

export function blankSheet(): SheetRaw {
  return { frontLeft: '', frontRight: '', backLeft: '', backRight: '' };
}

export function isValidTotalPages(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_TOTAL_PAGES && n <= MAX_TOTAL_PAGES && n % 4 === 0;
}

export function sheetCount(totalPages: number): number {
  if (!isValidTotalPages(totalPages)) {
    throw new RangeError(
      `总页数须为 ${MIN_TOTAL_PAGES}–${MAX_TOTAL_PAGES} 之间 4 的倍数，收到 ${totalPages}`,
    );
  }
  return totalPages / 4;
}

/** 第 sheetIndex 张（k）第 fieldIndex 格（0=正面左 … 3=反面右）的唯一期望页码 */
export function expectedPage(totalPages: number, sheetIndex: number, fieldIndex: number): number {
  const k = sheetIndex;
  switch (fieldIndex) {
    case 0:
      return totalPages - 2 * k; // 正面左
    case 1:
      return 1 + 2 * k; // 正面右
    case 2:
      return 2 + 2 * k; // 反面左
    case 3:
      return totalPages - 1 - 2 * k; // 反面右
    default:
      throw new RangeError(`fieldIndex 须在 0–3 之间，收到 ${fieldIndex}`);
  }
}

export function expectedSheetPages(
  totalPages: number,
  sheetIndex: number,
): [number, number, number, number] {
  return [0, 1, 2, 3].map((i) => expectedPage(totalPages, sheetIndex, i)) as [
    number,
    number,
    number,
    number,
  ];
}

// ---------- 录入解析与结构校验 ----------

export type ParseFailure = 'missing' | 'non-integer';

export function parsePage(raw: string): { ok: true; value: number } | { ok: false; kind: ParseFailure } {
  const text = raw.trim();
  if (text === '') return { ok: false, kind: 'missing' };
  if (!/^[+-]?\d+$/.test(text)) return { ok: false, kind: 'non-integer' };
  return { ok: true, value: Number.parseInt(text, 10) };
}

export type FieldErrorKind = 'missing' | 'non-integer' | 'out-of-range' | 'duplicate';

export interface FieldPosition {
  sheetIndex: number;
  field: FieldKey;
}

export interface FieldError extends FieldPosition {
  kind: FieldErrorKind;
  /** 涉及的具体页码（越界 / 重复时给出） */
  value?: number;
  /** 重复时与之冲突的其它字段位置 */
  peers?: FieldPosition[];
}

export function formatPosition(pos: FieldPosition): string {
  return `第 ${pos.sheetIndex + 1} 张 · ${FIELD_LABELS[pos.field]}`;
}

export function describeError(err: FieldError, totalPages: number): string {
  switch (err.kind) {
    case 'missing':
      return '未填写';
    case 'non-integer':
      return '页码不是整数';
    case 'out-of-range':
      return `页码 ${err.value} 超出 1–${totalPages} 范围`;
    case 'duplicate': {
      const others = (err.peers ?? []).map(formatPosition).join('、');
      return `页码 ${err.value} 重复（另见 ${others}）`;
    }
  }
}

/**
 * 结构校验：只检查 缺失 / 非整数 / 越界 / 重复，不做任何对错判断。
 * 返回按 张 → 格（录入顺序）排列的字段级错误列表。
 */
export function validateEntries(totalPages: number, sheets: SheetRaw[]): FieldError[] {
  const errors: FieldError[] = [];
  const owners = new Map<number, FieldPosition[]>();

  sheets.forEach((sheet, sheetIndex) => {
    for (const field of FIELD_ORDER) {
      const parsed = parsePage(sheet[field]);
      if (!parsed.ok) {
        errors.push({ sheetIndex, field, kind: parsed.kind });
        continue;
      }
      if (parsed.value < 1 || parsed.value > totalPages) {
        errors.push({ sheetIndex, field, kind: 'out-of-range', value: parsed.value });
        continue;
      }
      const pos: FieldPosition = { sheetIndex, field };
      const list = owners.get(parsed.value);
      if (list) list.push(pos);
      else owners.set(parsed.value, [pos]);
    }
  });

  for (const [value, positions] of owners) {
    if (positions.length < 2) continue;
    for (const pos of positions) {
      errors.push({
        ...pos,
        kind: 'duplicate',
        value,
        peers: positions.filter((p) => p !== pos),
      });
    }
  }

  return errors.sort(
    (a, b) => a.sheetIndex - b.sheetIndex || FIELD_ORDER.indexOf(a.field) - FIELD_ORDER.indexOf(b.field),
  );
}

// ---------- 结构合法后的逐格判定 ----------

export interface CellDiff {
  field: FieldKey;
  expected: number;
  actual: number;
  match: boolean;
}

export interface SheetVerdict {
  index: number;
  cells: [CellDiff, CellDiff, CellDiff, CellDiff];
  match: boolean;
}

export type AnalysisResult =
  | { status: 'invalid'; errors: FieldError[] }
  | { status: 'valid'; sheets: SheetVerdict[]; firstMismatchIndex: number | null };

/**
 * 核样主入口：
 * 1. 结构不合法 → invalid，只给字段位置，不产生成败结论；
 * 2. 结构合法 → 逐格比对，给出由外至内首张不符纸（保留其四格差异）；
 *    全部相符 → firstMismatchIndex 为 null。
 */
export function analyze(totalPages: number, sheets: SheetRaw[]): AnalysisResult {
  const errors = validateEntries(totalPages, sheets);
  if (errors.length > 0) return { status: 'invalid', errors };

  const verdicts: SheetVerdict[] = sheets.map((sheet, index) => {
    const cells = FIELD_ORDER.map((field, fieldIndex): CellDiff => {
      const parsed = parsePage(sheet[field]);
      // 结构已校验合法，此处必然解析成功
      const actual = parsed.ok ? parsed.value : Number.NaN;
      const expected = expectedPage(totalPages, index, fieldIndex);
      return { field, expected, actual, match: actual === expected };
    }) as [CellDiff, CellDiff, CellDiff, CellDiff];
    return { index, cells, match: cells.every((c) => c.match) };
  });

  const firstMismatch = verdicts.find((v) => !v.match);
  return {
    status: 'valid',
    sheets: verdicts,
    firstMismatchIndex: firstMismatch ? firstMismatch.index : null,
  };
}

// ---------- 批量录入文本解析（纯函数、确定性） ----------

export type BatchProblemKind = 'row-count' | 'column-count' | 'empty-cell' | 'non-integer';

export interface BatchProblem {
  kind: BatchProblemKind;
  /** 首个问题所在行（由外至内，0 起）；行数不符时指向首个缺失行或首个多余物理行 */
  row: number;
  /** 首个问题所在列（0=正面左 … 3=反面右）；行数问题没有列 */
  column?: number;
  /** 可直接展示的问题说明（已含行列定位） */
  message: string;
}

export interface BatchCell {
  /** 纸张序号（由外至内，0 起） */
  row: number;
  /** 格位序号（0=正面左 … 3=反面右） */
  column: number;
  field: FieldKey;
  /** 去空白后的整数原文，用于回填逐格录入 */
  raw: string;
  value: number;
}

export type BatchParseResult =
  | { ok: true; cells: BatchCell[] }
  | { ok: false; problem: BatchProblem };

/**
 * 解析批量录入文本（确定性，无副作用）：
 * - 每行恰 4 个整数，以单个空格或制表符分隔；行序对应实体纸由外至内；
 * - 兼容 CRLF/CR 换行与文本末尾单个换行；
 * - 仅当行数 == expectedRows 且每行恰 4 个整数时成功，调用方据此原子替换；
 * - 否则失败且不产出任何单元格数据，按 行数 → 列数 → 空项 → 非整数、
 *   同行内由左至右的顺序指出首个问题。
 * 越界 / 重复等结构问题不在此处判定，成功填入后仍走 validateEntries / analyze。
 */
export function parseBatchText(text: string, expectedRows: number): BatchParseResult {
  if (!Number.isInteger(expectedRows) || expectedRows <= 0) {
    throw new RangeError(`expectedRows 须为正整数，收到 ${expectedRows}`);
  }

  const normalized = text.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  // 文本末尾换行产生的空段不算一行
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();

  if (lines.length !== expectedRows) {
    return {
      ok: false,
      problem: {
        kind: 'row-count',
        row: Math.min(lines.length, expectedRows),
        message: `行数不符：文本共 ${lines.length} 行，应为 ${expectedRows} 行（对应 ${expectedRows} 张纸，由外至内）`,
      },
    };
  }

  // 逐行逐格扫描，定位首个问题
  for (let row = 0; row < lines.length; row++) {
    // 先去掉整行首尾空白；之后每个空格 / 制表符都是一个确定的分隔符，
    // 连续分隔符产生空段（空项），不做任何折叠
    const tokens = lines[row].trim().split(/[ \t]/);
    if (tokens.length !== FIELD_ORDER.length) {
      return {
        ok: false,
        problem: {
          kind: 'column-count',
          row,
          column: Math.min(tokens.length, FIELD_ORDER.length - 1),
          message: `第 ${row + 1} 行有 ${tokens.length} 项，应恰为 4 项（单个空格或制表符分隔）`,
        },
      };
    }
    for (let column = 0; column < FIELD_ORDER.length; column++) {
      const parsed = parsePage(tokens[column]);
      if (!parsed.ok) {
        const kind = parsed.kind === 'missing' ? 'empty-cell' : 'non-integer';
        const message =
          parsed.kind === 'missing'
            ? `第 ${row + 1} 行第 ${column + 1} 项（${FIELD_LABELS[FIELD_ORDER[column]]}）为空`
            : `第 ${row + 1} 行第 ${column + 1} 项（${FIELD_LABELS[FIELD_ORDER[column]]}）「${tokens[column].trim()}」不是整数`;
        return { ok: false, problem: { kind, row, column, message } };
      }
    }
  }

  const cells: BatchCell[] = [];
  for (let row = 0; row < lines.length; row++) {
    const tokens = lines[row].trim().split(/[ \t]/);
    for (let column = 0; column < FIELD_ORDER.length; column++) {
      const parsed = parsePage(tokens[column]);
      // 已通过上面的逐格扫描，此处必然解析成功
      if (parsed.ok) {
        cells.push({
          row,
          column,
          field: FIELD_ORDER[column],
          raw: tokens[column].trim(),
          value: parsed.value,
        });
      }
    }
  }
  return { ok: true, cells };
}

// ---------- 套页链 ----------

export interface ChainLink {
  index: number;
  pages: [number, number, number, number];
}

/** 全部匹配时输出：从最外张到最内张的完整套页链 */
export function nestingChain(totalPages: number): ChainLink[] {
  return Array.from({ length: sheetCount(totalPages) }, (_, index) => ({
    index,
    pages: expectedSheetPages(totalPages, index),
  }));
}
