import { expect, test } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

test('навигация с клавиатуры', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip')).toBeFocused();
  const nav = page.getByTestId('nav-calculator');
  await nav.focus();
  await page.keyboard.press('Enter');
  await expect(nav).toHaveAttribute('aria-current', 'page');
  await page.getByTestId('in-pH').focus();
  await page.keyboard.type('7.28');
  await page.keyboard.press('Tab');
  await page.keyboard.type('26');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('result')).toBeVisible();
});

test('все поля ввода имеют подпись', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-calculator').click();
  const unlabeled = await page.evaluate(() =>
    [...document.querySelectorAll('input, select')].filter((el) => {
      const id = el.id;
      return !(el.closest('label') || (id && document.querySelector(`label[for="${id}"]`)) || el.getAttribute('aria-label'));
    }).length,
  );
  expect(unlabeled).toBe(0);
});

test('офлайн: один HTML-файл открывается без сети', async ({ browser }) => {
  const context = await browser.newContext({ offline: true });
  const page = await context.newPage();
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('file:') && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) external.push(r.url());
  });
  await page.goto(pathToFileURL(resolve('dist/index.html')).href);
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('in-pH').fill('7,4');
  await page.getByTestId('in-pCO2').fill('40');
  await page.getByTestId('in-HCO3').fill('15');
  await page.getByTestId('calculate').click();
  await expect(page.getByTestId('result')).toContainText('Несогласованная проба');
  expect(external).toEqual([]);
  await context.close();
});
