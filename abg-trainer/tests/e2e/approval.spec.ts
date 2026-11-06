import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';

test('лист утверждения норм: отметка с ФИО, раздел, прогресс, выгрузка', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('footer')).toContainText('Нормы не утверждены');
  await page.getByTestId('footer-approval').click();
  await expect(page.getByTestId('approval')).toBeVisible();

  // без ФИО отметить нельзя
  await page.getByTestId('appr-check-dkaChild').click();
  await expect(page.getByTestId('appr-msg')).toContainText('Укажите ФИО');
  await expect(page.getByTestId('appr-check-dkaChild')).not.toBeChecked();

  await page.getByTestId('appr-name').fill('Проф. Тестов');
  await page.getByTestId('appr-check-dkaChild').check();
  await expect(page.getByTestId('appr-item-dkaChild')).toContainText('Проверил: Проф. Тестов');
  await expect(page.getByTestId('appr-state')).toContainText('Не утверждено');

  // подтверждённые по выдержкам пункты скрыты, пока включён фильтр
  await expect(page.getByTestId('appr-item-dkaChild2')).toHaveCount(0);
  await page.getByTestId('appr-filter').uncheck();
  await expect(page.getByTestId('appr-item-dkaChild2')).toBeVisible();

  // отметить все разделы: утверждено, видно в подвале и в настройках
  for (const area of ['categories', 'dka', 'hyperK', 'crisis', 'urine', 'fluids', 'pn', 'labs']) await page.getByTestId('appr-area-' + area).click();
  await expect(page.getByTestId('appr-state')).toContainText('Нормы утверждены: Проф. Тестов');
  await expect(page.getByTestId('approval')).toContainText('не загружено');

  const dl = page.waitForEvent('download');
  await page.getByTestId('appr-export').click();
  const html = readFileSync((await (await dl).path())!, 'utf8');
  expect(html).toContain('Лист утверждения норм');
  expect(html).toContain('dka.child.severity');
  expect(html).toContain('Проф. Тестов');
  expect(html).toContain('Подпись утверждающего');

  await page.getByTestId('nav-home').click();
  await expect(page.getByTestId('footer')).toContainText('Нормы утверждены: Проф. Тестов');
  await page.reload();
  await expect(page.getByTestId('footer')).toContainText('Нормы утверждены: Проф. Тестов');
});
