import { defineConfig, devices } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const frontendDirectory = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = resolve(frontendDirectory, '..')
const testStorage = join(tmpdir(), `careerforge-playwright-${randomUUID()}`)
const databasePath = join(testStorage, 'careerforge.db')
const uploadsPath = join(testStorage, 'uploads')
const pythonPath = process.env.CAREERFORGE_E2E_PYTHON ?? resolve(
  projectRoot,
  'backend',
  '.venv',
  process.platform === 'win32' ? 'Scripts' : 'bin',
  process.platform === 'win32' ? 'python.exe' : 'python',
)

export default defineConfig({
  metadata: { careerforgeE2eStorage: testStorage },
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  outputDir: 'test-results',
  globalTeardown: './tests/support/global-teardown.js',
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'webkit-mobile',
      testMatch: '**/responsive-errors.spec.js',
      use: { ...devices['iPhone 13'] },
    },
  ],
  webServer: [
    {
      command: `"${pythonPath}" "${resolve(frontendDirectory, 'tests', 'support', 'run-backend.py')}"`,
      cwd: projectRoot,
      url: 'http://127.0.0.1:8017/api/health',
      timeout: 60_000,
      reuseExistingServer: false,
      env: {
        CAREERFORGE_E2E_ROOT: testStorage,
        CAREERFORGE_DB_PATH: databasePath,
        CAREERFORGE_UPLOADS_DIR: uploadsPath,
        CAREERFORGE_E2E_PORT: '8017',
        CAREERFORGE_SECRET_KEY: 'careerforge-playwright-only-secret-key-0123456789',
        CAREERFORGE_CORS_ORIGINS: 'http://127.0.0.1:5174',
        PYTHONDONTWRITEBYTECODE: '1',
      },
    },
    {
      command: 'npm run dev -- --config vite.playwright.config.js --host 127.0.0.1 --port 5174 --strictPort',
      cwd: frontendDirectory,
      url: 'http://127.0.0.1:5174',
      timeout: 60_000,
      reuseExistingServer: false,
    },
  ],
})
