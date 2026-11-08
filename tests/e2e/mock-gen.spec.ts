import { expect, test } from '@playwright/test';
import { start } from './helpers';

// 既定の mock は、観測に応じて手口を組み立てて毎回違う TSX を生成する
test('生成 mock: 操作に応じて種類の違う邪魔が次々に出て、どれも sandbox で描画される', async ({ page }) => {
  const errors: string[] = [];
  page.on('response', async (r) => {
    if (r.url().endsWith('/decide')) {
      const j = await r.json().catch(() => null);
      if (j && !j.ok) errors.push(j.error);
    }
  });
  await start(page, '/products/aurora-nc700', '');
  await expect(page.getByTestId('llm-mode')).toContainText('MOCK');

  const ids = new Set<string>();
  const collect = async () => {
    for (const id of await page.locator('iframe[data-widget-id][data-widget-state="active"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-widget-id')!))) ids.add(id);
  };
  const price = await page.getByTestId('base-price').boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(price!.x + 5 + (i % 3), price!.y + 5);
    await page.waitForTimeout(100);
  }
  await expect.poll(async () => (await collect(), ids.size), { timeout: 20000 }).toBeGreaterThanOrEqual(1);
  await page.getByTestId('add-to-cart').click();
  await page.mouse.wheel(0, 600);
  await page.waitForTimeout(300);
  await page.mouse.wheel(0, -600);
  await expect.poll(async () => (await collect(), ids.size), { timeout: 25000 }).toBeGreaterThanOrEqual(3);

  // 放っておいても次々に増える（ゲームなので手を止めると邪魔が来る）
  await expect.poll(async () => (await collect(), ids.size), { timeout: 30000 }).toBeGreaterThanOrEqual(5);
  const families = new Set([...ids].map((id) => id.split('-')[0]));
  expect(families.size).toBeGreaterThanOrEqual(5);
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('mock-gen.png'), fullPage: true });
});

test('生成 mock: 偽エラーダイアログが画面いっぱいに次々湧き、ホストの「すべて閉じる」/Esc で消せる', async ({ page }) => {
  await start(page, '/products/aurora-nc700', '');
  const price = await page.getByTestId('base-price').boundingBox();
  for (let i = 0; i < 20; i++) {
    await page.mouse.move(price!.x + 5 + (i % 3), price!.y + 5);
    await page.waitForTimeout(100);
  }
  await page.getByTestId('add-to-cart').click();
  // 何度か邪魔したあとに嵐が来る
  await expect(page.locator('[data-storm-open="true"]')).toBeVisible({ timeout: 60000 });
  const storm = page.frameLocator('[data-storm-open="true"] iframe[data-widget-state="active"]');
  await expect.poll(() => storm.locator('.dlg').count(), { timeout: 10000 }).toBeGreaterThanOrEqual(20);
  // ダイアログの OK/キャンセルは閉じても増える
  await page.screenshot({ path: test.info().outputPath('storm.png') });
  // 逃げ道: デモ操作バーは上に出ている・Esc で全部消える
  await expect(page.getByTestId('control-reset').or(page.getByRole('button', { name: 'リセット' }))).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-storm-open="true"]')).toHaveCount(0);
  await expect(page.getByTestId('add-to-cart')).toBeEnabled();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('2');
});
