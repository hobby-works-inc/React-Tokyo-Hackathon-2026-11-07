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

  const families = new Set([...ids].map((id) => id.split('-')[0]));
  expect(families.size).toBeGreaterThanOrEqual(3);
  expect(errors).toEqual([]);
  await page.screenshot({ path: test.info().outputPath('mock-gen.png') });
});
