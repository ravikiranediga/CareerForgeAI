import { expect, test } from '@playwright/test'
import { createTestAccount, registerAndUploadResume } from './support/test-data.js'

const sidebarPages = [
  ['Home', '/dashboard'],
  ['Find Jobs', '/jobs'],
  ['Applications', '/applications'],
  ['Aptitude', '/aptitude'],
  ['Coding Practice', '/coding'],
  ['Interview Preparation', '/interview'],
  ['Resume Builder', '/resume'],
  ['Skill Assessment', '/skills'],
  ['Learning', '/learning'],
  ['Saved Jobs', '/saved'],
  ['Profile', '/profile'],
  ['Settings', '/settings'],
]

test('registers a dummy account and redirects it to resume onboarding', async ({ page }) => {
  const account = createTestAccount()
  await page.goto('/register')
  await page.getByLabel('Full name').fill(account.name)
  await page.getByLabel('Email address').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  await expect(page).toHaveURL(/\/onboarding$/)
  await expect(page.getByRole('heading', { name: 'Start with your resume' })).toBeVisible()
  await expect(page.getByText('PDF or DOCX · up to 8 MB')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Upload and analyze resume' })).toBeDisabled()
  await page.getByLabel('Consent to send resume to Google Gemini for analysis').check()
  await expect(page.getByRole('button', { name: 'Upload and analyze resume' })).toBeDisabled()
})

test('logs in and out using a generated dummy account', async ({ page }) => {
  const account = await registerAndUploadResume(page)

  await page.getByRole('button', { name: 'Logout' }).click()
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Email address').fill(account.email)
  await page.getByLabel('Password').fill(account.password)
  await page.getByRole('button', { name: 'Sign in' }).click()

  await expect(page).toHaveURL(/\/dashboard$/)
  await expect(page.getByRole('heading', { name: /Good Morning,/ })).toBeVisible()
})

test('redirects protected and unknown routes safely', async ({ page }) => {
  await page.goto('/profile')
  await expect(page).toHaveURL(/\/login$/)

  await registerAndUploadResume(page)
  await page.goto('/not-a-careerforge-page')
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('every sidebar item navigates to its discovered page route', async ({ page }) => {
  await registerAndUploadResume(page)

  for (const [label, route] of sidebarPages) {
    await page.locator('.sidebar nav .nav-item').filter({ hasText: label }).click()
    await expect(page).toHaveURL(new RegExp(`${route.replace('/', '\\/')}$`))
  }
})
