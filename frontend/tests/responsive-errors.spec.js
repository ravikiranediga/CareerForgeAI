import { expect, test } from '@playwright/test'
import { registerAndUploadResume } from './support/test-data.js'

test('mobile sidebar opens, navigates and closes at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await registerAndUploadResume(page)
  const sidebar = page.locator('.sidebar')
  await expect(sidebar).not.toHaveClass(/open/)
  await page.locator('.menu-btn').click()
  await expect(sidebar).toHaveClass(/open/)
  await page.locator('.sidebar nav .nav-item').filter({ hasText: 'Find Jobs' }).click()
  await expect(page).toHaveURL(/\/jobs$/)
  await expect(sidebar).not.toHaveClass(/open/)
  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(hasHorizontalOverflow).toBe(false)
})

test('main browser flow has no uncaught JavaScript errors or failed API responses', async ({ page }) => {
  const javascriptErrors = []
  const apiFailures = []
  page.on('pageerror', (error) => javascriptErrors.push(error.message))
  page.on('response', (response) => {
    if (new URL(response.url()).pathname.startsWith('/api/') && response.status() >= 400) {
      apiFailures.push(`${response.status()} ${response.url()}`)
    }
  })
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname.startsWith('/api/')) {
      apiFailures.push(`Network failure ${request.url()}: ${request.failure()?.errorText ?? 'unknown'}`)
    }
  })

  await registerAndUploadResume(page)
  const sidebar = page.locator('.sidebar')
  for (const route of ['/jobs', '/applications', '/aptitude', '/coding', '/interview', '/profile', '/resume', '/skills', '/saved', '/settings']) {
    const label = {
      '/jobs': 'Find Jobs',
      '/applications': 'Applications',
      '/aptitude': 'Aptitude',
      '/coding': 'Coding Practice',
      '/interview': 'Interview Preparation',
      '/profile': 'Profile',
      '/resume': 'Resume Builder',
      '/skills': 'Skill Assessment',
      '/saved': 'Saved Jobs',
      '/settings': 'Settings',
    }[route]
    if (await page.locator('.menu-btn').isVisible() && !await sidebar.evaluate((element) => element.classList.contains('open'))) {
      await page.locator('.menu-btn').click()
    }
    await page.locator('.sidebar nav .nav-item').filter({ hasText: label }).click()
    await expect(page).toHaveURL(new RegExp(`${route.replace('/', '\\/')}$`))
    await expect(page.locator('main.content-area')).toBeVisible()
    await page.waitForLoadState('networkidle')
  }

  expect(javascriptErrors).toEqual([])
  expect(apiFailures).toEqual([])
})
