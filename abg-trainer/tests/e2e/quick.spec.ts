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

test('вставка текста с ABL800 заполняет поля и считает', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('calc-mode-quick').click();
  await page.locator('.paste-abl summary').click();
  await page.getByTestId('paste-text').fill(
    'T 36.8 °C\nFO2(I) 25.0 %\npH 7.465\npCO2 44.1 mmHg\npO2 44.3 mmHg\nctHb 118 g/L\nsO2 81.0 %\ncK+ 2.7 mmol/L\ncNa+ 139 mmol/L\ncCa2+ 0.86 mmol/L\ncCl- 101 mmol/L\ncGlu 5.7 mmol/L\ncLac 1.4 mmol/L\ncBase(Ecf)c 7.3 mmol/L\ncHCO3-(P,st)c 29.4 mmol/L\ncHCO3-(P)c 31.3 mmol/L',
  );
  await page.getByTestId('paste-apply').click();
  await expect(page.getByTestId('paste-result')).toContainText('Распознано показателей');
  await expect(page.getByTestId('q-in-pH')).toHaveValue('7.465');
  await expect(page.getByTestId('q-in-HCO3')).toHaveValue('31.3');
  await expect(page.getByTestId('q-in-K')).toHaveValue('2.7');
  await page.getByTestId('q-age-adult').click();
  await page.getByTestId('q-sample-venous').click();
  await page.getByTestId('q-run').click();
  await expect(page.getByTestId('q-result')).toContainText('метаболический алкалоз');
});
