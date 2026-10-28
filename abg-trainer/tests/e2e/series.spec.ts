import { expect, test } from '@playwright/test';

test('динамика: два анализа, тренды, скорость Na⁺; справочник формул', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-calculator').click();
  await page.getByTestId('calc-mode-full').click();
  await page.getByTestId('sampleType').selectOption('arterial');
  for (const [k, v] of Object.entries({ pH: '7,2', pCO2: '28', HCO3: '10,6', Na: '118', lactate: '6' })) await page.getByTestId('in-' + k).fill(v);
  await page.getByTestId('calculate').click();
  await expect(page.getByRole('img', { name: /Диаграмма Давенпорта: pH 7,2/ })).toBeVisible();
  await page.getByTestId('series-add').click();
  const series = page.getByTestId('series');
  await expect(series).toContainText('Динамика: 1 анализов');
  // second sample 6 hours later
  for (const [k, v] of Object.entries({ pH: '7,3', pCO2: '30', HCO3: '14,5', Na: '124', lactate: '5,6' })) await page.getByTestId('in-' + k).fill(v);
  await page.getByTestId('calculate').click();
  await page.getByTestId('series-add').click();
  const times = series.locator('input[type=datetime-local]');
  await times.nth(1).fill('2030-01-01T06:00');
  await times.nth(0).fill('2030-01-01T00:00');
  await expect(series).toContainText('Na⁺ вырос на 6 ммоль/л за 6 ч');
  await expect(page.getByTestId('lactate-clearance')).toContainText('7%');
  await expect(series.getByTestId('map-trail')).toBeVisible();
  await expect(series.locator('figure.trend')).toHaveCount(5);
  await page.getByTestId('series-clear').click();
  await expect(series).toHaveCount(0);

  await page.getByTestId('nav-reference').click();
  await expect(page.getByTestId('reference')).toContainText('pCO₂ = 1,5 × HCO₃⁻ + 8 ± 2');
  await expect(page.getByTestId('reference')).toContainText('Severinghaus 1979');
});
