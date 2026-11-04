import { expect, test } from '@playwright/test'
import { registerAndUploadResume } from './support/test-data.js'

test.beforeEach(async ({ page }) => {
  await registerAndUploadResume(page)
})

test('edits profile details, re-analyzes and downloads the uploaded resume', async ({ page }) => {
  await page.goto('/profile')
  await expect(page.getByRole('heading', { name: 'My Profile' })).toBeVisible()
  await page.getByRole('button', { name: 'Edit profile' }).click()
  await page.getByLabel('Phone').fill('+1 555 010 3030')
  await page.getByRole('button', { name: 'Save profile' }).click()
  await expect(page.getByText('+1 555 010 3030')).toBeVisible()

  await page.getByLabel('Consent to send resume to Google Gemini for analysis').check()
  await page.getByRole('button', { name: 'Re-analyze' }).click()
  await expect(page.getByText(/Resume re-analyzed/)).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download original' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('careerforge-e2e-resume.docx')
})

test('edits resume-builder content, selects a template and invokes print', async ({ page }) => {
  await page.goto('/resume')
  await page.getByRole('button', { name: 'Add or edit details' }).click()
  await page.getByLabel('Professional headline').fill('Playwright QA Engineer')
  await page.getByLabel('Professional summary').fill('Builds reliable browser tests and full-stack applications.')
  await page.getByLabel('Skills').fill('Playwright, JavaScript, FastAPI')
  await page.getByRole('button', { name: 'Save resume details' }).click()
  await expect(page.locator('#resume-document')).toContainText('Playwright QA Engineer')
  await expect(page.locator('#resume-document')).toContainText('FastAPI')

  await page.getByLabel('Template').selectOption('modern')
  await expect(page.locator('#resume-document')).toHaveClass(/resume-template-modern/)
  await page.evaluate(() => {
    window.__careerForgePrintCalled = false
    window.print = () => { window.__careerForgePrintCalled = true }
  })
  await page.getByRole('button', { name: 'Download as PDF' }).click()
  await expect.poll(() => page.evaluate(() => window.__careerForgePrintCalled)).toBe(true)
})

test('reports resume section coverage consistently without claiming an ATS score', async ({ page }) => {
  await page.goto('/resume')
  await expect(page.getByText('Resume section coverage').first()).toBeVisible()
  await expect(page.getByText(/does not test ATS parsing or predict hiring outcomes/)).toBeVisible()

  const includedSections = await page.locator('.resume-suggestions li').filter({ hasText: 'included' }).count()
  const displayedScore = await page.locator('.resume-builder-summary .resume-score-card strong').innerText()
  expect(Number(displayedScore.split('/')[0])).toBe(Math.round((includedSections / 6) * 100))
})

test('persists theme selection and signs out from settings', async ({ page }) => {
  await page.goto('/settings')
  await page.locator('.settings-card').first().getByRole('button', { name: 'Switch to dark mode' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login$/)
})
