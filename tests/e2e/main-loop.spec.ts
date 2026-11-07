import { expect, test } from '@playwright/test';
import { activeFrame, activeIframe, captureDecide, start } from './helpers';

test('観測→生成TSX→隔離表示→ウィジェット操作→次の判断→種明かし→防御モード', async ({ page }) => {
  const bodies = captureDecide(page);
  await start(page);
  await expect(page.getByTestId('llm-mode')).toContainText('MOCK');

  // 価格付近にカーソルを置く（表示時間でも発火する）
  const price = await page.getByTestId('base-price').boundingBox();
  for (let i = 0; i < 15; i++) {
    await page.mouse.move(price!.x + 5 + (i % 3), price!.y + 5);
    await page.waitForTimeout(100);
  }
  await expect(activeIframe(page, 'price-limited')).toBeVisible({ timeout: 15000 });
  await expect(activeFrame(page, 'price-limited').getByText('人気上昇中')).toBeVisible();
  // 送った観測には価格エリアの集計がある（座標列ではない）
  const withPrice = bodies.find((b) => b.regions?.some((r: any) => r.id === 'price'));
  expect(withPrice).toBeTruthy();
  expect(JSON.stringify(bodies)).not.toMatch(/clientX|"x":/);

  // 主要操作（カート追加）は定期送信を待たずに送られ、保証トグルが生成される
  await page.getByTestId('add-to-cart').click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
  await expect(activeIframe(page, 'warranty-nudge')).toBeVisible({ timeout: 4000 });

  // 生成トグルの操作がホスト側の状態（料金）に反映される
  await activeFrame(page, 'warranty-nudge').locator('[data-action-id="warranty-toggle"]').click();
  await expect(page.getByTestId('option-warranty')).toBeChecked();
  await expect(page.getByTestId('detail-subtotal')).toHaveText('¥52,780');
  // その反応が次の判断材料になる
  await expect.poll(() => bodies.some((b) => b.recentEvents?.some((e: any) => e.type === 'widget_option_change' && e.isNew))).toBe(true);

  // ウィジェット内の × で閉じる
  await activeFrame(page, 'price-limited').locator('[data-action-id="price-limited-close"]').click();
  await expect(page.locator('iframe[data-widget-id="price-limited"]')).toHaveCount(0);

  // カート: 比較パネル
  await page.getByRole('link', { name: /カート/ }).first().click();
  await expect(page.getByTestId('cart-total')).toHaveText('¥52,780');
  const total = await page.getByTestId('cart-total').boundingBox();
  for (let i = 0; i < 10; i++) {
    await page.mouse.move(total!.x + 5 + (i % 3), total!.y + 5);
    await page.waitForTimeout(100);
  }
  await expect(activeIframe(page, 'cart-compare')).toBeVisible({ timeout: 15000 });
  await page.getByTestId('cart-option-warranty').uncheck();
  await expect(page.getByTestId('cart-total')).toHaveText('¥49,800');
  await page.getByTestId('checkout').click();
  await expect(page.getByTestId('order-total')).toHaveText('¥49,800');
  await page.getByTestId('go-result').click();
  await expect(page.getByTestId('result-verdict')).toContainText('課題達成');

  // 種明かし
  await page.getByTestId('result-reveal').click();
  const tl = page.getByTestId('reveal-timeline');
  await expect(tl).toContainText('観測事実');
  await expect(tl).toContainText('AIの仮説');
  await expect(tl).toContainText('限定感');
  await expect(tl).toContainText('生成UIを閉じた');
  await expect(tl).not.toContainText('見ていた');

  // 防御モード: 同じウィジェットを安全なUIに作り替える
  await page.getByTestId('defend-instruction').fill('料金をはっきり');
  await page.getByTestId('switch-defend').click();
  await expect(page.getByTestId('ui-mode')).toContainText('防御モード');
  await expect(activeFrame(page, 'warranty-nudge').getByRole('button', { name: '付けない' })).toBeVisible({ timeout: 15000 });
  const defendBody = bodies.find((b) => b.mode === 'defend');
  expect(defendBody.userInstruction).toBe('料金をはっきり');
  expect(defendBody.trigger).toBe('manual');
});
