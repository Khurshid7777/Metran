import { expect, test } from '@playwright/test';

test('справочник: растворы — 3 % NaCl из 23,4 % и 0,9 %, GIR и натрий в мл', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-reference').click();
  await page.getByTestId('ref-tab-solutions').click();
  const tool = page.getByTestId('solutions-tool');
  await expect(tool).toBeVisible();
  await page.getByTestId('sol-dil').selectOption('0.9');
  await expect(page.getByTestId('sol-stock-ml')).toContainText('9,3');
  await expect(page.getByTestId('sol-dil-ml')).toContainText('90,7');
  await expect(page.getByTestId('sol-result')).toContainText('513 ммоль Na⁺/л');

  // нельзя получить 5 % из 3 %
  await page.getByTestId('sol-stock').selectOption('3');
  await page.getByTestId('sol-target').fill('5');
  await expect(tool.getByRole('alert')).toContainText('между разбавителем');

  // глюкоза 10 % из 40 % и воды
  await page.getByTestId('sol-glucose').click();
  await page.getByTestId('sol-stock').selectOption('40');
  await page.getByTestId('sol-vol').fill('500');
  await expect(page.getByTestId('sol-stock-ml')).toContainText('125');

  await expect(page.getByTestId('gir-now')).toContainText('3,33');
  await page.getByTestId('gir-t').fill('5');
  await expect(page.getByTestId('gir-need')).toContainText('9');
  await page.getByTestId('na-mmol').fill('15');
  await expect(page.getByTestId('na-ml')).toContainText('29,2');
});

test('справочник: парентеральное питание — объёмы, энергия и предупреждения', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-reference').click();
  await page.getByTestId('ref-tab-pn').click();
  await expect(page.getByTestId('pn-ml-aa')).toHaveText('64');
  await expect(page.getByTestId('pn-total')).toHaveText('384');
  await expect(page.getByTestId('pn-kcalkg')).toContainText('57');

  await page.getByTestId('pn-lipid').fill('3,5');
  await expect(page.getByTestId('pn-result')).toContainText('Липиды выше предела');
  await page.getByTestId('pn-fluid').fill('50');
  await expect(page.getByTestId('pn-result')).toContainText('превышает общий объём');

  await page.getByTestId('pn-g-adult').click();
  await expect(page.getByTestId('pn-weight')).toHaveValue('70');
  await page.getByTestId('pn-gir').fill('6');
  await expect(page.getByTestId('pn-result')).toContainText('≤ 5 мг/кг/мин');
});

test('справочник: алгоритм КЩС и вкладка запоминается', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-reference').click();
  await page.getByTestId('ref-tab-guide').click();
  await expect(page.getByTestId('guide')).toContainText('Δ/Δ');
  await expect(page.getByTestId('guide')).toContainText('pCO₂ = 1,5 × HCO₃⁻ + 8 ± 2');
  await page.reload();
  await page.getByTestId('nav-reference').click();
  await expect(page.getByTestId('guide')).toBeVisible();
});

test('результат: ориентир по КЩС и формулы суточного дефицита', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('full-example').click();
  const orient = page.getByTestId('orientation');
  await expect(orient).toContainText('Анионный интервал');
  await expect(orient).toContainText('метаболический ацидоз');
  await expect(orient).toContainText('Ищите источник кислоты');
  const plan = page.getByTestId('fluid-plan');
  await plan.getByTestId('fluid-pct').fill('5');
  await expect(plan.getByTestId('fluid-calc')).toContainText('Дефицит = 5 % × 70 кг × 10 = 3500 мл');
  await expect(plan.getByTestId('fluid-calc')).toContainText('Поддерживающая (4-2-1)');
});

test('гипо-состояния: карточка с приготовлением концентратов', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('ageCategory').selectOption('child');
  await page.getByTestId('sampleType').selectOption('venous');
  for (const [k, v] of Object.entries({ pH: '7,38', pCO2: '38', HCO3: '22', Na: '122', K: '2,7', glucose: '2,4', iCa: '0,9', weightKg: '10' })) await page.getByTestId('in-' + k).fill(v);
  await page.getByTestId('calculate').click();
  const c = page.getByTestId('concentrates');
  await expect(c.getByTestId('conc-K')).toContainText('Набрать KCl 4 %');
  await expect(c.getByTestId('conc-K')).toContainText('9,3 мл');
  await expect(c.getByTestId('conc-K')).toContainText('125 мл');
  await c.getByTestId('kcl-7.5').click();
  await expect(c.getByTestId('conc-K')).toContainText('Набрать KCl 7,5 %');
  await expect(c.getByTestId('conc-K')).toContainText('5 мл');
  await c.getByTestId('kcl-other').fill('3');
  await expect(c.getByTestId('conc-K')).toContainText('Набрать KCl 3 %');
  await expect(c.getByTestId('conc-K')).toContainText('12,4 мл');
  await expect(c.getByTestId('conc-K')).toContainText('не более');
  await expect(c.getByTestId('conc-Na')).toContainText('9,3 мл NaCl 23,4 %');
  await expect(c.getByTestId('conc-Ca')).toContainText('0,225');
  await expect(c.getByTestId('conc-glucose')).toContainText('20 мл + 80 мл воды');
});
