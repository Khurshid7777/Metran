import { expect, test } from '@playwright/test';

test('быстрый ввод: Enter по полям, обязательный тип пробы, переход к подробному разбору', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('calc-mode-quick').click();
  await page.getByTestId('q-age-adult').click();
  const first = page.getByTestId('q-in-pH');
  await first.fill('7,465');
  await first.press('Enter');
  await expect(page.getByTestId('q-in-pCO2')).toBeFocused();
  await page.keyboard.type('44,1');
  await page.keyboard.press('Enter');
  await page.keyboard.type('44,3');
  await page.getByTestId('q-in-HCO3').fill('31,3');
  await page.getByTestId('q-in-K').fill('2,7');
  await page.getByTestId('q-run').click();
  await expect(page.getByText('Выберите тип пробы').first()).toBeVisible();
  await page.getByTestId('q-sample-venous').click();
  await page.getByTestId('q-run').click();
  await expect(page.getByTestId('q-result')).toContainText('Первичное нарушение: метаболический алкалоз.');
  await expect(page.getByTestId('q-result')).toContainText('умеренная гипокалиемия');
  await page.getByTestId('q-details').click();
  await expect(page.getByTestId('in-HCO3')).toHaveValue('31,3');
  await expect(page.getByTestId('result')).toContainText('метаболический алкалоз');
});
