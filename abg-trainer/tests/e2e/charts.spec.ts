import { expect, test } from '@playwright/test';

test('подробный разбор: карта КЩС, гэмблграмма, формулы, дефициты, билирубин', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-calculator').click();
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('sampleType').selectOption('arterial');
  for (const [k, v] of Object.entries({ pH: '7,2', pCO2: '30', HCO3: '11,4', BE: '-15', Na: '128', Cl: '100', albumin: '25', weightKg: '70' })) {
    await page.getByTestId('in-' + k).fill(v);
  }
  await page.getByTestId('calculate').click();
  const res = page.getByTestId('result');
  await expect(res.getByRole('img', { name: /Карта КЩС: pCO₂ 30/ })).toBeVisible();
  await expect(res.getByRole('img', { name: /Гэмблграмма/ })).toBeVisible();
  await expect(res).toContainText('pCO₂ ожид. = 1,5 × 11,4 + 8 = 25,1');
  await expect(res).toContainText('AG_корр = 16,6 + 0,25 × (40 − 25) = 20,3');
  await expect(page.getByTestId('deficits')).toContainText('= 294 ммоль');
  await page.getByText('Как получен вывод').click();
  await expect(res).toContainText('совпадает ли второй показатель');

  await page.getByTestId('ageCategory').selectOption('preterm');
  for (const [k, v] of Object.entries({ gestationalWeeks: '29', ageHours: '72', bilirubin: '150' })) await page.getByTestId('in-' + k).fill(v);
  await page.getByTestId('calculate').click();
  await expect(res.getByRole('img', { name: /Билирубин 150/ })).toBeVisible();
  await expect(res).toContainText('выше порога фототерапии');
});
