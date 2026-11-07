import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

test('резервная копия: сохранить и восстановить данные', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'abg-backup-'));
  await page.goto('/');
  await page.evaluate(() => window.localStorage.setItem('abg-trainer:approver', JSON.stringify('Д-р Копия')));
  await page.getByTestId('nav-settings').click();
  const dl = page.waitForEvent('download');
  await page.getByTestId('backup-save').click();
  const json = JSON.parse(readFileSync((await (await dl).path())!, 'utf8'));
  expect(json.format).toBe('abg-trainer-backup');
  expect(json.data.approver).toBe('Д-р Копия');

  await page.evaluate(() => window.localStorage.removeItem('abg-trainer:approver'));
  const file = join(dir, 'backup.json');
  writeFileSync(file, JSON.stringify(json));
  await page.getByTestId('backup-file').setInputFiles(file);
  await page.getByTestId('backup-apply').click();
  await expect(page.getByTestId('backup-msg')).toContainText('Восстановлено', { timeout: 10000 });
  await page.waitForLoadState('load');
  expect(await page.evaluate(() => window.localStorage.getItem('abg-trainer:approver'))).toBe('"Д-р Копия"');

  const bad = join(dir, 'bad.json');
  writeFileSync(bad, '{"x":1}');
  await page.getByTestId('nav-settings').click();
  await page.getByTestId('backup-file').setInputFiles(bad);
  await expect(page.getByTestId('backup-msg')).toContainText('не файл резервной копии');
});

test('заключение для передачи смены: текст со значениями и сдвигами', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-calculator').click();
  await page.getByTestId('calc-mode-quick').click();
  await page.getByTestId('q-age-adult').click();
  await page.getByTestId('q-sample-arterial').click();
  await page.getByTestId('q-in-pH').fill('7,25');
  await page.getByTestId('q-in-pCO2').fill('28');
  await page.getByTestId('q-in-HCO3').fill('12');
  await page.getByTestId('q-in-K').fill('6,8');
  await page.getByTestId('q-run').click();
  await page.getByTestId('handoff').click();
  const text = await page.getByTestId('handoff-text').inputValue();
  expect(text).toContain('Артериальная');
  expect(text).toContain('Заключение:');
  expect(text).toContain('Калий 6,8');
  expect(text).toContain('метаболический ацидоз');
});
