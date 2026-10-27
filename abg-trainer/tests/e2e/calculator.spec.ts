import { expect, test } from '@playwright/test';

test('калькулятор → заключение', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('disclaimer')).toBeVisible();
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('in-pH').fill('7,28');
  await page.getByTestId('in-pCO2').fill('26');
  await page.getByTestId('in-HCO3').fill('12');
  await page.getByTestId('in-Na').fill('140');
  await page.getByTestId('in-Cl').fill('118');
  await page.getByTestId('in-albumin').fill('40');
  await page.getByTestId('calculate').click();
  const result = page.getByTestId('result');
  await expect(result).toContainText('Первичное нарушение: метаболический ацидоз.');
  await expect(result).toContainText('Компенсация: адекватная.');
  await expect(result).toContainText('AG_корр 10');
});

test('вне диапазона — блокировка с подсказкой про единицы', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-calculator').click();
  await page.getByTestId('in-pH').fill('7.3');
  await page.getByTestId('in-pCO2').fill('400');
  await page.getByTestId('calculate').click();
  await expect(page.getByText('Проверьте единицы').first()).toBeVisible();
});

test('переключение языка и десятичный разделитель', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('lang').selectOption('en');
  await page.getByTestId('nav-calculator').click();
  await page.getByTestId('in-pH').fill('7.25');
  await page.getByTestId('in-pCO2').fill('60');
  await page.getByTestId('in-HCO3').fill('26');
  await page.getByTestId('calculate').click();
  await expect(page.getByTestId('result')).toContainText('Primary disorder: respiratory acidosis.');
  await expect(page.getByTestId('result')).toContainText('Course: acute.');
  await page.getByTestId('lang').selectOption('uz');
  await expect(page.locator('h2').first()).not.toHaveText('Calculator');
});

test('нет горизонтальной прокрутки на узком экране', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('/');
  await page.getByTestId('nav-calculator').click();
  await page.getByTestId('calculate').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
