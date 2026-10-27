import { expect, test } from '@playwright/test';

test('экзамен → PDF-сертификат и проверка кода', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('abg-trainer:settings', JSON.stringify({ examCases: 3, examMinutes: 40, passPercent: 0 }));
    localStorage.setItem('abg-trainer:profile', JSON.stringify({ fullName: 'Тестов Тест', specialty: 'resident', institution: 'Симцентр', lang: 'ru' }));
  });
  await page.reload();
  await page.getByTestId('mode-exam').click();
  await page.getByTestId('exam-level-1').check();
  await page.getByTestId('exam-start').click();
  for (let i = 0; i < 2; i++) await page.getByTestId('exam-next').click();
  await page.getByTestId('exam-finish').click();
  await expect(page.getByTestId('exam-result')).toBeVisible();
  const code = await page.getByTestId('cert-code').innerText();
  expect(code).toMatch(/^ABG-[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{3}$/);
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByTestId('cert-download').click()]);
  expect(download.suggestedFilename()).toBe(`certificate-${code}.pdf`);
  const path = await download.path();
  const fs = await import('node:fs');
  expect(fs.readFileSync(path!).subarray(0, 5).toString()).toBe('%PDF-');

  await page.getByTestId('nav-settings').click();
  await page.getByRole('button', { name: 'Проверка сертификата' }).click();
  await page.getByTestId('verify-code').fill(code);
  await page.getByTestId('verify-btn').click();
  await expect(page.getByTestId('verify-ok')).toBeVisible();

  await page.getByTestId('nav-progress').click();
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByTestId('export-csv').click()]);
  expect(csv.suggestedFilename()).toMatch(/\.csv$/);
});
