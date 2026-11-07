import { expect, test } from '@playwright/test';
import { activeIframe, captureDecide, start } from './helpers';

test('不正なコード（禁止API）は拒否され、通常ECはそのまま使える', async ({ page }) => {
  await page.goto('/products/aurora-nc700?mockScenario=broken');
  await page.locator('html[data-hydrated="1"]').waitFor();
  await page.getByTestId('consent-accept').click();
  await page.getByTestId('devpanel-toggle').click();
  await expect(page.getByTestId('dp-log')).toContainText('generation rejected', { timeout: 15000 });
  await expect(page.locator('iframe[data-widget-id]')).toHaveCount(0);
  await page.getByTestId('devpanel-toggle').click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
});

test('実行時エラーのウィジェットは表示されず、直前の正常なUIを維持する', async ({ page }) => {
  await page.goto('/products/aurora-nc700?mockScenario=runtime_error');
  await page.locator('html[data-hydrated="1"]').waitFor();
  await page.getByTestId('consent-accept').click();
  await page.getByTestId('devpanel-toggle').click();
  await expect(page.locator('[data-status="render_failed"]').first()).toBeVisible({ timeout: 15000 });
  await expect(page.locator('iframe[data-widget-state="active"]')).toHaveCount(0);
  await page.getByTestId('devpanel-toggle').click();
  await page.getByTestId('option-warranty').check();
  await expect(page.getByTestId('detail-subtotal')).toHaveText('¥52,780');
});

test('バックグラウンドタブでは定期送信しない', async ({ page }) => {
  const bodies = captureDecide(page);
  await start(page, '/');
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const before = bodies.length;
  await page.waitForTimeout(11000);
  expect(bodies.length).toBe(before);
});

test('連続クリックはデバウンスでまとめる', async ({ page }) => {
  const bodies = captureDecide(page);
  await start(page);
  const before = bodies.length;
  for (let i = 0; i < 5; i++) await page.getByTestId('add-to-cart').click({ delay: 0 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('cart-count')).toHaveText('5');
  const major = bodies.slice(before).filter((b) => b.trigger === 'major_action');
  expect(major.length).toBeLessThanOrEqual(2);
  expect(major.at(-1).recentEvents.filter((e: any) => e.type === 'cart_add').length).toBe(5);
});

test('生成中にリセットすると古い応答は適用されない', async ({ page }) => {
  await page.goto('/products/aurora-nc700?mockScenario=slow');
  await page.locator('html[data-hydrated="1"]').waitFor();
  await page.getByTestId('consent-accept').click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('llm-status')).toHaveText('AI判断中…');
  await page.getByTestId('reset').click();
  await expect(page.getByTestId('consent-accept')).toBeVisible();
  await page.waitForTimeout(4000);
  await expect(page.locator('iframe[data-widget-id]')).toHaveCount(0);
  await expect(page.getByTestId('cart-count')).toHaveText('0');
});

test('生成中のページ遷移では古い画面向けの応答を適用しない', async ({ page }) => {
  await page.goto('/products/aurora-nc700?mockScenario=slow');
  await page.locator('html[data-hydrated="1"]').waitFor();
  await page.getByTestId('consent-accept').click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('llm-status')).toHaveText('AI判断中…');
  await page.getByRole('link', { name: /カート/ }).first().click();
  await page.getByTestId('devpanel-toggle').click();
  await expect(page.locator('[data-status="stale"]').first()).toBeVisible({ timeout: 8000 });
  await expect(page.locator('iframe[data-widget-id="warranty-nudge"]')).toHaveCount(0);
});

test('生成中のモード変更では切替前の応答を適用しない', async ({ page }) => {
  await page.goto('/products/aurora-nc700?mockScenario=slow');
  await page.locator('html[data-hydrated="1"]').waitFor();
  await page.getByTestId('consent-accept').click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('llm-status')).toHaveText('AI判断中…');
  await page.getByTestId('reveal').click();
  await page.getByTestId('switch-defend').click();
  await page.waitForTimeout(6000);
  // challenge の warranty-nudge は適用されない（defend では対象なしで noop）
  await expect(page.locator('iframe[data-widget-id="warranty-nudge"]')).toHaveCount(0);
});

test('体験終了後は生成が止まる', async ({ page }) => {
  const bodies = captureDecide(page);
  await start(page);
  await page.getByTestId('finish').click();
  await expect(page).toHaveURL(/result/);
  const n = bodies.length;
  await page.waitForTimeout(7000);
  expect(bodies.length).toBe(n);
});
