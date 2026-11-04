import { expect, test } from '@playwright/test';

const attempt = (id: string, scenarioId: string, ok: boolean, date: string) => ({
  id, date, mode: 'trainer', level: 1, caseId: 'x-' + id, scenarioId, answers: [], timeMs: 1000, hintsUsed: 0,
  score: ok ? 9 : 2, maxScore: 10, conclusionCorrect: ok, hasSecondary: false, missedSecondary: false, albuminMasked: false, missedAlbumin: false,
});

test('повторение: ошибочная тема предлагается в тренажёре и видна в плане прогресса', async ({ page }) => {
  await page.addInitScript((list) => {
    if (!window.localStorage.getItem('abg-trainer:attempts')) window.localStorage.setItem('abg-trainer:attempts', JSON.stringify(list));
  }, [
    attempt('a1', 'met_acid_simple', false, '2026-01-01T10:00:00.000Z'),
    attempt('a2', 'met_alk_simple', true, new Date().toISOString()),
  ]);
  await page.goto('/');
  await page.getByTestId('mode-trainer').click();
  await page.getByTestId('level-1').check();
  await page.getByTestId('source-review').check();
  await expect(page.getByTestId('review-count')).toContainText('1');
  await page.getByTestId('trainer-start').click();
  await expect(page.getByTestId('to-steps')).toBeVisible();
  await expect(page.getByText(/Сепсис, гипотония/)).toBeVisible();

  await page.getByTestId('nav-progress').click();
  const plan = page.getByTestId('review-plan');
  await expect(plan).toContainText('метаболический ацидоз');
  await expect(plan.locator('tr.due')).toHaveCount(1);
  await expect(page.getByTestId('by-type')).toContainText('метаболический');
});

test('повторение: без просроченных тем запуск недоступен', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-trainer').click();
  await page.getByTestId('source-review').check();
  await expect(page.getByTestId('review-note')).toContainText('нет тем к повторению');
  await expect(page.getByTestId('trainer-start')).toBeDisabled();
});
