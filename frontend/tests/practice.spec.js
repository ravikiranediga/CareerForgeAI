import { expect, test } from '@playwright/test'
import { registerAndUploadResume } from './support/test-data.js'

test.beforeEach(async ({ page }) => {
  await registerAndUploadResume(page)
})

test('answers an aptitude question and records account progress', async ({ page }) => {
  await page.goto('/aptitude')
  await expect(page.getByRole('heading', { name: 'Aptitude Practice' })).toBeVisible()
  await expect(page.locator('.question-card').first()).toBeVisible()
  await page.getByRole('button', { name: 'Start question' }).first().click()
  await page.locator('input[type="radio"]').first().check()
  await page.getByRole('button', { name: 'Submit answer' }).click()
  await expect(page.getByText(/Correct answer:/)).toBeVisible()
})

test('records a coding solution as practice without executing or judging it', async ({ page }) => {
  await page.goto('/coding')
  await expect(page.getByText('available problems').first()).toBeVisible()
  await page.getByLabel('Programming language').selectOption('JavaScript')
  await page.getByRole('button', { name: 'Open problem' }).first().click()
  await page.getByLabel('Your JavaScript solution or approach').fill(
    'function solve(input) { return input.map((value) => value * 2); } // test approach',
  )
  await expect(page.getByText(/Practice-only mode/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Run code' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Save practice as completed' }).click()
  await expect(page.getByText('Practice recorded', { exact: true })).toBeVisible()
})

test('shows readable coding problem details, sample cases, constraints and an optional hint', async ({ page }) => {
  await page.goto('/coding')
  await page.getByRole('button', { name: 'Open problem' }).first().click()

  await expect(page.getByRole('heading', { name: 'Pair Sum' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sample input' })).toBeVisible()
  await expect(page.locator('.coding-problem-section').filter({ has: page.getByRole('heading', { name: 'Sample input' }) })).toContainText('target = 9')
  await expect(page.locator('.coding-problem-section').filter({ has: page.getByRole('heading', { name: 'Sample output' }) })).toContainText('[0, 1]')
  await expect(page.getByRole('heading', { name: 'Constraints' })).toBeVisible()

  const hint = page.locator('.coding-hint')
  await expect(hint).not.toHaveAttribute('open', '')
  await hint.getByText('Show hint').click()
  await expect(hint).toContainText('store each value')

  const fontSizes = await page.evaluate(() => ({
    title: Number.parseFloat(getComputedStyle(document.querySelector('.coding-question-title')).fontSize),
    prompt: Number.parseFloat(getComputedStyle(document.querySelector('.coding-question-prompt')).fontSize),
  }))
  expect(fontSizes.title).toBeGreaterThanOrEqual(24)
  expect(fontSizes.prompt).toBeGreaterThanOrEqual(17)
})

test('requires explicit consent before displaying AI interview feedback', async ({ page }) => {
  await page.goto('/interview')
  await expect(page.getByRole('heading', { name: 'Interview Preparation' })).toBeVisible()
  await page.getByRole('button', { name: 'Practice answer' }).first().click()
  await page.getByLabel('Your interview answer').fill(
    'For example, I built a small application with my team. We improved the response time, and I learned to measure our result carefully.',
  )
  const submit = page.getByRole('button', { name: 'Submit answer for feedback' })
  await expect(submit).toBeDisabled()
  const consentGuardStatus = await page.evaluate(async () => {
    const token = localStorage.getItem('careerforge_token')
    const questionsResponse = await fetch('/api/practice/questions?kind=interview', {
      headers: { Authorization: 'Bearer ' + token },
    })
    const questions = await questionsResponse.json()
    const response = await fetch('/api/practice/attempts', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        question_id: questions[0].id,
        answer_text: 'A valid length answer without consent to contact the external provider.',
      }),
    })
    return response.status
  })
  expect(consentGuardStatus).toBe(422)
  await page.getByLabel(/send the written question and answer to Google Gemini/).check()
  await expect(submit).toBeEnabled()
  await submit.click()
  await expect(page.getByText('Overall practice score')).toBeVisible()
  await expect(page.locator('.feedback-score-grid').getByText('Relevance', { exact: true })).toBeVisible()
  await expect(page.locator('.practice-feedback small')).toContainText('AI-generated practice feedback')
})
