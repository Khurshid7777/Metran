import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('редактор: случай сохраняется, попадает в выдачу, экспорт и импорт', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('open-editor').click();
  await page.getByTestId('ed-age').selectOption('adult');
  await page.getByTestId('ed-in-pH').fill('7,25');
  await page.getByTestId('ed-in-pCO2').fill('28');
  await page.getByTestId('ed-in-HCO3').fill('12');
  await page.getByTestId('ed-in-Na').fill('140');
  await page.getByTestId('ed-in-Cl').fill('112');
  await page.getByTestId('ed-vignette-ru').fill('Взрослый, диарея третьи сутки.');

  // без рецензента и с неверным эталоном сохранить нельзя
  await page.getByTestId('ed-primary').selectOption('respiratory_acidosis');
  await expect(page.getByTestId('ed-match')).toContainText('не совпадает');
  await page.getByTestId('ed-save').click();
  await expect(page.getByTestId('ed-msg')).toContainText('рецензента');
  await page.getByTestId('ed-reviewer').fill('Проф. Тестов');
  await page.getByTestId('ed-save').click();
  await expect(page.getByTestId('ed-msg')).toContainText('Эталон не совпадает');

  await page.getByTestId('ed-use-detected').click();
  await expect(page.getByTestId('ed-match')).toContainText('совпадает с результатом ядра');
  await page.getByTestId('ed-save').click();
  await expect(page.getByTestId('ed-msg')).toContainText('сохранён');
  await expect(page.getByTestId('ed-list')).toContainText('Взрослый, диарея');

  // случай виден в сводке банка
  await page.getByRole('button', { name: 'К настройкам' }).click();
  await expect(page.getByText(/В выдаче: 7\./)).toBeVisible();

  // экспорт и импорт
  await page.getByTestId('open-editor').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('ed-export').click();
  const json = readFileSync((await (await dl).path())!, 'utf8');
  const cases = JSON.parse(json);
  expect(cases).toHaveLength(1);
  expect(cases[0].expected.primary).toBe('metabolic_acidosis');
  await page.getByTestId('ed-import').fill(JSON.stringify([{ ...cases[0], id: 'local-copy' }]));
  await page.getByTestId('ed-import-run').click();
  await expect(page.getByTestId('ed-msg')).toContainText('новых: 1');
  await expect(page.getByTestId('ed-list')).toContainText('Мои случаи: 2');
});
