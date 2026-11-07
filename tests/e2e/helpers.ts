import { expect, type Page } from '@playwright/test';

/** 既存の E2E は固定3種の mock（classic）で流れを確認する。生成 mock は mock-gen.spec.ts */
export async function start(page: Page, path = '/products/aurora-nc700', scenario = 'classic') {
  await page.goto(path.includes('mockScenario=') || !scenario ? path : `${path}${path.includes('?') ? '&' : '?'}mockScenario=${scenario}`);
  await page.locator('html[data-hydrated="1"]').waitFor();
  await page.getByTestId('consent-accept').click();
  await expect(page.getByTestId('reveal')).toBeVisible();
}

export const activeFrame = (page: Page, id: string) => page.frameLocator(`iframe[data-widget-id="${id}"][data-widget-state="active"]`);
export const activeIframe = (page: Page, id: string) => page.locator(`iframe[data-widget-id="${id}"][data-widget-state="active"]`);

export function captureDecide(page: Page) {
  const bodies: any[] = [];
  page.on('request', (r) => {
    if (r.url().endsWith('/decide') && r.method() === 'POST') bodies.push(JSON.parse(r.postData() ?? '{}'));
  });
  return bodies;
}
