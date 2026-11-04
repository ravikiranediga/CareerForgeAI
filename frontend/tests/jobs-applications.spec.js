import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { registerAndUploadResume } from './support/test-data.js'

test.beforeEach(async ({ page }) => {
  await registerAndUploadResume(page)
})

test('searches and filters the seeded job listings', async ({ page }) => {
  await page.goto('/jobs')
  const cards = page.locator('.compact-job')
  await expect(cards).toHaveCount(3)
  await expect(page.getByText(/Live Adzuna listings/)).toBeVisible()

  await page.getByPlaceholder('Search jobs, companies, skills...').last().fill('Python Developer')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Example Labs')

  await page.getByPlaceholder('Search jobs, companies, skills...').last().fill('AI/ML Engineer')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Machine Learning Engineer')

  await page.getByPlaceholder('Search jobs, companies, skills...').last().fill('')
  await page.locator('.jobs-toolbar select').first().selectOption('Bengaluru')
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Acme AI')

  await page.locator('.jobs-toolbar select').first().selectOption('All')
  const filters = page.locator('.jobs-toolbar select')
  await filters.nth(1).selectOption({ label: 'Junior' })
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('Data Analyst')

  await page.getByPlaceholder('Search jobs, companies, skills...').last().fill('no matching role')
  await expect(cards).toHaveCount(0)
  await page.getByRole('button', { name: 'Reset filters' }).click()
  await expect(cards).toHaveCount(3)
})

test('saves and removes a job from Saved Jobs', async ({ page }) => {
  await page.goto('/jobs')
  const job = page.locator('.compact-job').filter({ hasText: 'Python Developer' })
  await job.getByRole('button', { name: 'Save job' }).click()
  await expect(job.getByRole('button', { name: 'Remove saved job' })).toBeVisible()

  await page.locator('.sidebar nav .nav-item').filter({ hasText: 'Saved Jobs' }).click()
  const savedJob = page.locator('.saved-item').filter({ hasText: 'Python Developer' })
  await expect(savedJob).toBeVisible()
  await savedJob.getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('heading', { name: 'No saved jobs yet' })).toBeVisible()
})

test('tracks a job application and updates its status', async ({ page }) => {
  await page.goto('/jobs')
  const job = page.locator('.compact-job').filter({ hasText: 'Python Developer' })
  await job.getByRole('button', { name: 'Apply Now' }).click()

  const apply = page.getByRole('button', { name: 'Apply Now' }).last()
  await expect(apply).toBeDisabled()
  await page.getByLabel('Confirm before continuing to employer').check()
  await expect(apply).toBeEnabled()
  await apply.click()
  await expect(page.getByRole('heading', { name: 'Tracking saved — application not submitted' })).toBeVisible()
  const employerLink = page.getByRole('link', { name: 'Continue to employer site' })
  await expect(employerLink).toHaveAttribute('href', 'https://jobs.example.test/careerforge-e2e-job-1')

  await page.locator('.modal-card > .panel-header .icon-btn').click()
  await page.locator('.sidebar nav .nav-item').filter({ hasText: 'Applications' }).click()
  const application = page.locator('.application-row').filter({ hasText: 'Example Labs' })
  await expect(application).toContainText('Ready to apply')
  await expect(application).toContainText('careerforge-e2e-resume.docx')

  await application.getByRole('button', { name: 'Mark Applied after submitting' }).click()
  await expect(application).toContainText('Applied')
  await application.getByRole('button', { name: 'Interview' }).click()
  await expect(application).toContainText('Interview')
})

test('requires confirmation and enforces resume and application ownership', async ({ page }) => {
  await page.goto('/jobs')
  const result = await page.evaluate(async () => {
    const ownerToken = localStorage.getItem('careerforge_token')
    const ownerProfileResponse = await fetch('/api/profile', {
      headers: { Authorization: `Bearer ${ownerToken}` },
    })
    const ownerProfile = await ownerProfileResponse.json()
    const jobsResponse = await fetch('/api/jobs')
    const jobs = await jobsResponse.json()
    const job = jobs[0]
    const missingConsentResponse = await fetch('/api/applications', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_id: job.id,
        resume_id: ownerProfile.resume.id,
        confirmed_external_sharing: false,
      }),
    })
    const otherAccountResponse = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Other Candidate',
        email: `other.${crypto.randomUUID()}@example.com`,
        password: 'Playwright-test-password-2026',
      }),
    })
    const otherAccount = await otherAccountResponse.json()
    const foreignResumeResponse = await fetch('/api/applications', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${otherAccount.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_id: job.id,
        resume_id: ownerProfile.resume.id,
        confirmed_external_sharing: true,
      }),
    })
    const foreignResumeDownloadResponse = await fetch(
      `/api/profile/resumes/${ownerProfile.resume.id}/download`,
      { headers: { Authorization: `Bearer ${otherAccount.access_token}` } },
    )
    const foreignApplicationListResponse = await fetch('/api/applications', {
      headers: { Authorization: `Bearer ${otherAccount.access_token}` },
    })
    const foreignApplications = await foreignApplicationListResponse.json()
    const ownerApplicationResponse = await fetch('/api/applications', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${ownerToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        job_id: job.id,
        resume_id: ownerProfile.resume.id,
        confirmed_external_sharing: true,
      }),
    })
    const ownerApplication = await ownerApplicationResponse.json()
    const foreignStatusResponse = await fetch(`/api/applications/${ownerApplication.id}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${otherAccount.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'Applied' }),
    })
    return {
      missingConsent: missingConsentResponse.status,
      foreignResume: foreignResumeResponse.status,
      foreignResumeDownload: foreignResumeDownloadResponse.status,
      foreignApplicationCount: foreignApplications.length,
      ownerCreated: ownerApplicationResponse.status,
      foreignStatus: foreignStatusResponse.status,
      applicationStatus: ownerApplication.status,
    }
  })

  expect(result).toEqual({
    missingConsent: 422,
    foreignResume: 404,
    foreignResumeDownload: 404,
    foreignApplicationCount: 0,
    ownerCreated: 201,
    foreignStatus: 404,
    applicationStatus: 'Ready to apply',
  })
})

test('uploads an additional private resume and allows selecting it for an application', async ({ page }) => {
  await page.locator('.sidebar nav .nav-item').filter({ hasText: 'Profile' }).click()
  const fileInput = page.getByLabel('Upload another resume')
  await fileInput.setInputFiles({
    name: 'alternate-resume.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: await readFile(new URL('./fixtures/careerforge-e2e-resume.docx', import.meta.url)),
  })
  await page.getByLabel('Consent to send new resume text to Google Gemini for analysis').check()
  await page.getByRole('button', { name: 'Upload and save resume' }).click()
  await expect(page.getByText('alternate-resume.docx')).toBeVisible()

  await page.locator('.sidebar nav .nav-item').filter({ hasText: 'Find Jobs' }).click()
  const job = page.locator('.compact-job').filter({ hasText: 'Python Developer' })
  await job.getByRole('button', { name: 'Apply Now' }).click()
  const resumePicker = page.getByLabel('Resume to use')
  await expect(resumePicker.locator('option')).toHaveCount(2)
  await resumePicker.selectOption({ label: 'alternate-resume.docx (current)' })
  await expect(resumePicker).toHaveValue(/^\d+$/)
  await page.getByLabel('Confirm before continuing to employer').check()
  await page.getByRole('button', { name: 'Apply Now' }).last().click()
  await expect(page.getByRole('heading', { name: 'Tracking saved — application not submitted' })).toBeVisible()
  await page.locator('.modal-card > .panel-header .icon-btn').click()
  await page.locator('.sidebar nav .nav-item').filter({ hasText: 'Applications' }).click()
  await expect(page.locator('.application-row')).toContainText('alternate-resume.docx')
})
