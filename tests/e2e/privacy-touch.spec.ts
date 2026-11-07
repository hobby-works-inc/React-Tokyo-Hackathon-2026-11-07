import { expect, test } from '@playwright/test';
import { captureDecide, start } from './helpers';

test('ダミーログイン・登録が動き、パスワードは送信・保存・ログ出力されない', async ({ page }) => {
  const bodies = captureDecide(page);
  const consoleLines: string[] = [];
  page.on('console', (m) => consoleLines.push(m.text()));
  await start(page, '/login');
  await page.getByTestId('login-fill').click();
  await page.getByTestId('login-pw').fill('S3cret-Passw0rd!');
  await page.getByTestId('login-submit').click();
  await expect(page.getByText('こんにちは、demo-userさん')).toBeVisible();
  await page.getByRole('button', { name: 'ログアウト' }).click();
  await page.getByRole('link', { name: '新規登録' }).click();
  await page.getByTestId('signup-fill').click();
  await page.getByTestId('signup-pw').fill('S3cret-Passw0rd!');
  await page.getByTestId('signup-submit').click();
  await expect(page.getByText('こんにちは、デモ太郎さん')).toBeVisible();
  await page.waitForTimeout(6000);
  const storage = await page.evaluate(() => JSON.stringify({ ...sessionStorage, ...localStorage }));
  for (const text of [JSON.stringify(bodies), storage, consoleLines.join('\n')]) {
    expect(text).not.toContain('S3cret-Passw0rd!');
    expect(text).not.toContain('demo-pass');
  }
});

test.describe('タッチ入力', () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
  test('タッチではホバーを捏造しない（カーソル値は null）', async ({ page }) => {
    const bodies = captureDecide(page);
    await page.goto('/products/aurora-nc700');
    await page.locator('html[data-hydrated="1"]').waitFor();
    await page.getByTestId('consent-accept').tap();
    await page.getByTestId('base-price').tap();
    await page.getByTestId('add-to-cart').tap();
    await expect.poll(() => bodies.length, { timeout: 10000 }).toBeGreaterThan(0);
    const last = bodies.at(-1);
    expect(last.pageState.pointerType).toBe('touch');
    for (const r of last.regions) {
      expect(r.cursorDwellMs).toBeNull();
      expect(r.cursorStationaryMs).toBeNull();
    }
  });
});
