import { expect, test } from '@playwright/test';
import { activeFrame, activeIframe, start } from './helpers';

test('再読込してもログイン状態とカートが残る', async ({ page }) => {
  await start(page, '/login');
  await page.getByTestId('login-fill').click();
  await page.getByTestId('login-submit').click();
  await expect(page.getByText('こんにちは、demo-userさん')).toBeVisible();
  await page.getByRole('link', { name: /Aurora NC700/ }).click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
  await page.reload();
  await page.locator('html[data-hydrated="1"]').waitFor();
  await expect(page.getByText('こんにちは、demo-userさん')).toBeVisible();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
});

test('防御モードの生成UIは切れずに選択肢まで表示され、ホスト側の閉じるボタンもある', async ({ page }) => {
  await start(page);
  await page.getByTestId('add-to-cart').click();
  await expect(activeIframe(page, 'warranty-nudge')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('reveal').click();
  await page.getByTestId('switch-defend').click();
  const frame = activeFrame(page, 'warranty-nudge');
  await expect(frame.getByRole('button', { name: '付けない' })).toBeVisible({ timeout: 15000 });
  // ボタンが iframe の表示範囲内にある（下端で切れていない）
  const iframeBox = await activeIframe(page, 'warranty-nudge').boundingBox();
  const btnBox = await frame.getByRole('button', { name: '付けない' }).boundingBox();
  expect(btnBox!.y + btnBox!.height).toBeLessThanOrEqual(iframeBox!.y + iframeBox!.height + 1);
  await page.locator('[data-action-id="host-close-warranty-nudge"]').click();
  await expect(page.locator('iframe[data-widget-id="warranty-nudge"]')).toHaveCount(0);
});

test('生成コードはクリックなしで保証をオンにできない', async ({ page }) => {
  await page.goto('/products/aurora-nc700?mockScenario=auto_option');
  await page.locator('html[data-hydrated="1"]').waitFor();
  await page.getByTestId('consent-accept').click();
  await expect(activeIframe(page, 'broken-demo')).toBeVisible({ timeout: 15000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId('option-warranty')).not.toBeChecked();
  await expect(page.getByTestId('detail-subtotal')).toHaveText('¥49,800');
  // 本物のクリックなら受け付ける
  await activeFrame(page, 'broken-demo').locator('[data-action-id="auto"]').click();
  await expect(page.getByTestId('option-warranty')).toBeChecked();
});

test('無限ループの生成コードでも画面全体は固まらず、通常ECを操作できる', async ({ page }) => {
  await page.goto('/products/aurora-nc700?mockScenario=infinite_loop');
  await page.locator('html[data-hydrated="1"]').waitFor();
  await page.getByTestId('consent-accept').click();
  await page.getByTestId('devpanel-toggle').click();
  await expect(page.locator('[data-status="render_failed"]').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByTestId('dp-log')).toContainText('loop limit');
  await page.getByTestId('devpanel-toggle').click();
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
});

test('AI が 401（合言葉なし・誤り）を返したら画面に表示し、送り続けない', async ({ page }) => {
  let calls = 0;
  await page.route('**/decide', async (route) => {
    calls++;
    await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, requestId: 'x', source: 'live', error: 'access token required for live mode', latencyMs: 1 }) });
  });
  await start(page);
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('llm-notice')).toContainText('合言葉', { timeout: 10000 });
  const n = calls;
  await page.getByTestId('add-to-cart').click();
  await page.waitForTimeout(7000);
  expect(calls).toBe(n);
});
