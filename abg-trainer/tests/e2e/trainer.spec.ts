import { expect, test } from '@playwright/test';

test('тренажёр → дебрифинг', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-trainer').click();
  await page.getByTestId('level-2').check();
  await page.getByTestId('trainer-start').click();
  await page.getByTestId('to-steps').click();
  for (let i = 0; i < 20; i++) {
    if (await page.getByTestId('debrief').isVisible()) break;
    const radio = page.locator('.question input[type=radio]').first();
    if (await radio.count()) await radio.check();
    else await page.locator('.question input[inputmode=decimal]').fill('10');
    if (i === 0) await page.getByTestId('hint').click();
    await page.getByTestId('check').click();
    await expect(page.getByTestId('feedback')).toBeVisible();
    await page.getByTestId('next').click();
  }
  await expect(page.getByTestId('debrief')).toBeVisible();
  await expect(page.getByTestId('debrief')).toContainText('Правильное заключение');
  await page.getByTestId('nav-progress').click();
  await expect(page.locator('.bars li').first()).toBeVisible();
});
