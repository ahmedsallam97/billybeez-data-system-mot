require('../e2e/account-fixtures').installLanguageFixture();
const { test, expect } = require('@playwright/test');
const fs = require('node:fs'), path = require('node:path');
test('capture settings before the draft UX pass from the retained production build', async ({ page }) => {
  const folder = path.resolve('docs/audit-evidence/settings-drafts'); fs.mkdirSync(folder, { recursive: true });
  await page.setViewportSize({ width: 1366, height: 768 });
  for (const language of ['en', 'ar']) {
    await page.addInitScript(language => localStorage.setItem('bbLanguage', language), language);
    for (const category of ['rules', 'roster']) {
      await page.goto(`/opmanager/settings?category=${category}`, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { name: language === 'ar' ? 'إعدادات العمليات' : 'Operations settings', exact: true })).toBeVisible();
      await expect(page.locator('[data-setting-status]')).toHaveCount(0);
      await page.screenshot({ path: path.join(folder, `${category}-before-${language}-laptop.png`) });
    }
  }
});

test('identify the existing extra roster print page without changing application code', async ({ page }) => {
  const { PDFDocument } = require('pdf-lib');
  const folder = path.resolve('docs/audit-evidence/settings-drafts');
  await page.goto('/operations/daily-preview?date=2026-09-29', { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => { document.body.dataset.dailyPreviewPrint = 'true'; }); await page.emulateMedia({ media: 'print' });
  const before = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  await page.addStyleTag({ content: 'body[data-daily-preview-print] .module-page-identity{display:none!important}' });
  const after = await PDFDocument.load(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  fs.writeFileSync(path.join(folder, 'print-baseline.json'), JSON.stringify({ retainedBuild: 'tmp/.next-roster-ux', originalPages: before.getPageCount(), pagesWithShellTitleExcluded: after.getPageCount() }, null, 2));
  expect(before.getPageCount()).toBe(2); expect(after.getPageCount()).toBe(1);
});
