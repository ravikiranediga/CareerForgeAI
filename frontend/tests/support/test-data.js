import { expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const resumePath = fileURLToPath(new URL('../fixtures/careerforge-e2e-resume.docx', import.meta.url))

export function createTestAccount(name = 'Jordan Playwright') {
  return {
    name,
    email: `careerforge.e2e.${randomUUID()}@example.com`,
    password: 'Playwright-test-password-2026',
  }
}

export async function registerAndUploadResume(page, account = createTestAccount()) {
  await page.goto('/register')
  await page.getByLabel('Full name').fill(account.name)
  await page.getByLabel('Email address').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()
  await expect(page).toHaveURL(/\/onboarding$/)

  await page.locator('input[type="file"]').setInputFiles(resumePath)
  await page.getByLabel('Consent to send resume to Google Gemini for analysis').check()
  await page.getByRole('button', { name: 'Upload and analyze resume' }).click()
  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: /Good Morning,/ })).toBeVisible()
  await expect(page.getByText(/Gemini resume analysis|Resume analyzed with Google Gemini/)).toBeVisible()
  await page.waitForLoadState('networkidle')
  return account
}
