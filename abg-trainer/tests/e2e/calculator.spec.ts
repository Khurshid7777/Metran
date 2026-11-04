import { expect, test } from '@playwright/test';

test('калькулятор → заключение', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('disclaimer')).toBeVisible();
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('sampleType').selectOption('arterial');
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
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('sampleType').selectOption('arterial');
  await page.getByTestId('in-pH').fill('7.3');
  await page.getByTestId('in-pCO2').fill('400');
  await page.getByTestId('calculate').click();
  await expect(page.getByText('Проверьте единицы').first()).toBeVisible();
});

test('переключение языка и десятичный разделитель', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('lang').selectOption('en');
  await page.getByTestId('nav-calculator').click();
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('sampleType').selectOption('arterial');
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
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('sampleType').selectOption('arterial');
  await page.getByTestId('calculate').click();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});

test('ДКА: карточка с тяжестью, осмолярностью и предупреждением по калию', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('ageCategory').selectOption('child');
  await page.getByTestId('sampleType').selectOption('venous');
  await page.getByTestId('in-pH').fill('7,05');
  await page.getByTestId('in-pCO2').fill('20');
  await page.getByTestId('in-HCO3').fill('5');
  await page.getByTestId('in-Na').fill('132');
  await page.getByTestId('in-K').fill('2,8');
  await page.getByTestId('in-glucose').fill('28');
  await page.getByTestId('in-weightKg').fill('20');
  await page.getByTestId('calculate').click();
  const card = page.getByTestId('dka-card');
  await expect(card).toContainText('Диабетический кетоацидоз');
  await expect(card).toContainText('тяжёлая');
  await expect(card).toContainText('292');
  await expect(card).toContainText('1–2 ед/ч');
  await expect(page.getByTestId('result')).toContainText('отложите инсулин');
});

test('моча и коррекция Na: карточки появляются при введённых данных', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('sampleType').selectOption('venous');
  await page.getByTestId('in-pH').fill('7,25');
  await page.getByTestId('in-pCO2').fill('28');
  await page.getByTestId('in-HCO3').fill('12');
  await page.getByTestId('in-Na').fill('120');
  await page.getByTestId('in-Cl').fill('90');
  await page.getByTestId('in-weightKg').fill('70');
  await page.getByTestId('in-urineNa').fill('20');
  await page.getByTestId('in-urineK').fill('30');
  await page.getByTestId('in-urineCl').fill('80');
  await page.getByTestId('calculate').click();
  await expect(page.getByTestId('urine-card')).toContainText('отрицательный');
  await expect(page.getByTestId('na-correction')).toContainText('NaCl 3 %');
  await expect(page.getByTestId('na-correction')).toContainText('не повышает Na⁺');
});

test('гиперкалиемия: карточка с дозами и чек-лист пробы', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('calc-mode-full').click();
  await page.locator('[data-testid="preanalytic"] summary').click();
  await expect(page.getByTestId('preanalytic')).toContainText('пузырьки');
  await page.getByTestId('ageCategory').selectOption('child');
  await page.getByTestId('sampleType').selectOption('venous');
  await page.getByTestId('in-pH').fill('7,41');
  await page.getByTestId('in-pCO2').fill('40');
  await page.getByTestId('in-HCO3').fill('25');
  await page.getByTestId('in-K').fill('6,8');
  await page.getByTestId('in-weightKg').fill('8');
  await page.getByTestId('calculate').click();
  const card = page.getByTestId('hyperk-card');
  await expect(card).toContainText('Тяжёлая');
  await expect(card).toContainText('0,8 ед');
  await expect(card).toContainText('40 мл');
  await expect(page.getByTestId('result')).toContainText('возможен гемолиз');
});

test('подробный режим: «Пример» считает сразу, а исключение расчётов убирает их из результата', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('full-example').click();
  const result = page.getByTestId('result');
  await expect(result).toBeVisible();
  await expect(page.getByTestId('in-ScvO2')).toHaveValue('68');
  await expect(page.getByTestId('dka-card')).toBeVisible();
  await expect(result).toContainText('Перфузия');
  await expect(result).toContainText('Вентиляция');

  await page.locator('[data-testid="exclude-panel"] summary').click();
  await page.getByTestId('exclude-dka').check();
  await page.getByTestId('exclude-m.perfusion').check();
  await expect(page.getByTestId('dka-card')).toHaveCount(0);
  await expect(page.getByTestId('excluded-note')).toContainText('Диабетический кетоацидоз');
  await expect(page.getByTestId('exclude-count')).toHaveText('2');

  await page.getByTestId('exclude-reset').click();
  await expect(page.getByTestId('dka-card')).toBeVisible();
  await expect(page.getByTestId('excluded-note')).toHaveCount(0);
});
