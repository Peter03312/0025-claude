import { expect, test, type Page } from '@playwright/test';

/** N=8 时两张纸的正确录入：k=0 → [8,1,2,7]，k=1 → [6,3,4,5] */
const N8_SHEET0 = ['8', '1', '2', '7'] as const;
const N8_SHEET1 = ['6', '3', '4', '5'] as const;

const FIELDS = ['frontLeft', 'frontRight', 'backLeft', 'backRight'] as const;

async function generate(page: Page, n: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('total-pages').fill(n);
  await page.getByTestId('generate').click();
}

async function fillSheet(page: Page, index: number, values: readonly string[]): Promise<void> {
  for (let i = 0; i < FIELDS.length; i++) {
    await page.getByTestId(`input-${index}-${FIELDS[i]}`).fill(values[i]);
  }
}

test('非法总页数被拒绝且不生成纸堆', async ({ page }) => {
  await generate(page, '10');
  await expect(page.getByTestId('total-pages-error')).toContainText('4 的倍数');
  await expect(page.getByTestId('sheet-0')).toHaveCount(0);

  await page.getByTestId('total-pages').fill('66');
  await page.getByTestId('generate').click();
  await expect(page.getByTestId('total-pages-error')).toContainText('4 的倍数');
  await expect(page.getByTestId('sheet-0')).toHaveCount(0);
});

test('全部匹配：唯一可锁线结论 + 最外到最内完整套页链', async ({ page }) => {
  await generate(page, '8');
  await fillSheet(page, 0, N8_SHEET0);
  await fillSheet(page, 1, N8_SHEET1);
  await page.getByTestId('analyze').click();

  await expect(page.getByTestId('conclusion-title')).toHaveText('可锁线');
  await expect(page.getByTestId('chain').locator('li')).toHaveCount(2);
  await expect(page.getByTestId('chain-0')).toContainText('最外');
  await expect(page.getByTestId('chain-0')).toContainText('8 · 1 · 2 · 7');
  await expect(page.getByTestId('chain-1')).toContainText('最内');
  await expect(page.getByTestId('chain-1')).toContainText('6 · 3 · 4 · 5');
});

test('重复页码：先报字段位置且不给结论，录入纠错后判可锁线', async ({ page }) => {
  await generate(page, '8');
  await fillSheet(page, 0, N8_SHEET0);
  await fillSheet(page, 1, ['6', '1', '4', '5']); // 正面右误录为 1，与第 1 张正面右重复
  await page.getByTestId('analyze').click();

  // 只给字段位置，不产生成败结论
  await expect(page.getByTestId('conclusion-title')).toContainText('暂无结论');
  const errors = page.getByTestId('error-list').locator('li');
  await expect(errors).toHaveCount(2);
  await expect(errors.nth(0)).toContainText('第 1 张 · 正面右');
  await expect(errors.nth(0)).toContainText('重复');
  await expect(errors.nth(1)).toContainText('第 2 张 · 正面右');
  await expect(page.getByTestId('diff-table')).toHaveCount(0);
  await expect(page.getByTestId('chain')).toHaveCount(0);

  // 录入纠错：改回 3 后重新核样
  await page.getByTestId('input-1-frontRight').fill('3');
  await page.getByTestId('analyze').click();
  await expect(page.getByTestId('conclusion-title')).toHaveText('可锁线');
});

test('非整数页码：报字段位置，修正后通过', async ({ page }) => {
  await generate(page, '8');
  await fillSheet(page, 0, ['8', '1.5', '2', '7']);
  await fillSheet(page, 1, N8_SHEET1);
  await page.getByTestId('analyze').click();

  await expect(page.getByTestId('conclusion-title')).toContainText('暂无结论');
  const item = page.getByTestId('error-list').locator('li');
  await expect(item).toHaveCount(1);
  await expect(item.first()).toContainText('第 1 张 · 正面右');
  await expect(item.first()).toContainText('不是整数');

  await page.getByTestId('input-0-frontRight').fill('1');
  await page.getByTestId('analyze').click();
  await expect(page.getByTestId('conclusion-title')).toHaveText('可锁线');
});

test('越界页码：报字段位置与合法范围', async ({ page }) => {
  await generate(page, '8');
  await fillSheet(page, 0, ['8', '1', '2', '9']); // 反面右越界（N=8）
  await fillSheet(page, 1, N8_SHEET1);
  await page.getByTestId('analyze').click();

  await expect(page.getByTestId('conclusion-title')).toContainText('暂无结论');
  const item = page.getByTestId('error-list').locator('li');
  await expect(item).toHaveCount(1);
  await expect(item.first()).toContainText('第 1 张 · 反面右');
  await expect(item.first()).toContainText('超出 1–8 范围');
});

test('缺失页码：报字段位置', async ({ page }) => {
  await generate(page, '8');
  await fillSheet(page, 0, ['8', '', '2', '7']); // 正面右留空
  await fillSheet(page, 1, N8_SHEET1);
  await page.getByTestId('analyze').click();

  await expect(page.getByTestId('conclusion-title')).toContainText('暂无结论');
  const item = page.getByTestId('error-list').locator('li');
  await expect(item).toHaveCount(1);
  await expect(item.first()).toContainText('第 1 张 · 正面右');
  await expect(item.first()).toContainText('未填写');
});

test('中间两张对调：定位首张不符纸并保留四格差异', async ({ page }) => {
  await generate(page, '8');
  await fillSheet(page, 0, N8_SHEET1); // 内外两张对调
  await fillSheet(page, 1, N8_SHEET0);
  await page.getByTestId('analyze').click();

  await expect(page.getByTestId('conclusion-title')).toContainText('不可锁线');
  await expect(page.getByTestId('conclusion-title')).toContainText('第 1 张');
  const rows = page.getByTestId('diff-table').locator('tbody tr');
  await expect(rows).toHaveCount(4);
  // 第 1 张实测 [6,3,4,5]，期望 [8,1,2,7]，四格全部不符
  for (const field of FIELDS) {
    await expect(page.getByTestId(`diff-${field}`)).toContainText('✗');
  }
  await expect(page.getByTestId('diff-frontLeft')).toContainText('6');
  await expect(page.getByTestId('diff-frontLeft')).toContainText('8');
  await expect(page.getByTestId('diff-backRight')).toContainText('5');
  await expect(page.getByTestId('diff-backRight')).toContainText('7');
});

test('有一面翻反：四格差异中正面两格相符、反面两格不符', async ({ page }) => {
  await generate(page, '8');
  await fillSheet(page, 0, ['8', '1', '7', '2']); // 反面左右颠倒
  await fillSheet(page, 1, N8_SHEET1);
  await page.getByTestId('analyze').click();

  await expect(page.getByTestId('conclusion-title')).toContainText('不可锁线');
  await expect(page.getByTestId('conclusion-title')).toContainText('第 1 张');
  await expect(page.getByTestId('diff-frontLeft')).toContainText('✓');
  await expect(page.getByTestId('diff-frontRight')).toContainText('✓');
  await expect(page.getByTestId('diff-backLeft')).toContainText('✗');
  await expect(page.getByTestId('diff-backRight')).toContainText('✗');
});

test('嵌套卡片可展开收起', async ({ page }) => {
  await generate(page, '12');
  await expect(page.getByTestId('sheet-2')).toBeVisible();
  await page.getByTestId('toggle-0').click();
  await expect(page.getByTestId('sheet-1')).toBeHidden();
  await expect(page.getByTestId('sheet-2')).toBeHidden();
  await page.getByTestId('toggle-0').click();
  await expect(page.getByTestId('sheet-1')).toBeVisible();
  await expect(page.getByTestId('sheet-2')).toBeVisible();
});

test('改动录入后旧结论立即作废', async ({ page }) => {
  await generate(page, '8');
  await fillSheet(page, 0, N8_SHEET0);
  await fillSheet(page, 1, N8_SHEET1);
  await page.getByTestId('analyze').click();
  await expect(page.getByTestId('conclusion-title')).toHaveText('可锁线');

  await page.getByTestId('input-0-frontLeft').fill('7');
  await expect(page.getByTestId('conclusion-panel')).toHaveCount(0);
});

test('N=4 单张纸全流程', async ({ page }) => {
  await generate(page, '4');
  await fillSheet(page, 0, ['4', '1', '2', '3']);
  await page.getByTestId('analyze').click();
  await expect(page.getByTestId('conclusion-title')).toHaveText('可锁线');
  await expect(page.getByTestId('chain-0')).toContainText('4 · 1 · 2 · 3');
});
