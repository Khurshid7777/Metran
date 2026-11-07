import { expect, test } from '@playwright/test';

test('PWA: манифест, иконки, сервис-воркер и работа без сети', async ({ page, context, request }) => {
  await page.goto('/');
  await expect(page.getByTestId('disclaimer')).toBeVisible();

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  const m = await (await request.get('/' + manifestHref!.replace('./', ''))).json();
  expect(m.display).toBe('standalone');
  expect(m.name).toBe('Тренажёр КЩС');
  for (const icon of m.icons) expect((await request.get('/' + icon.src)).ok(), icon.src).toBe(true);
  expect((await request.get('/apple-touch-icon.png')).ok()).toBe(true);

  // the service worker takes control and the app opens with the network off
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
  await page.reload();
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('disclaimer')).toBeVisible();
  await page.getByTestId('mode-calculator').click();
  await expect(page.getByTestId('calc-mode-quick')).toBeVisible();
  await context.setOffline(false);
});

test('PWA: подсказка установки на iPhone показывается только в Safari без установки', async ({ browser }) => {
  const ctx = await browser.newContext({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:4173/');
  // plain http on localhost: no hint (it appears on https hosts only)
  await expect(page.getByTestId('disclaimer')).toBeVisible();
  await expect(page.getByTestId('pwa-ios')).toHaveCount(0);
  await ctx.close();
});
