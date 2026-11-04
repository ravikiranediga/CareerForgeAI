# CareerForge

CareerForge is a career-preparation web app. The code is organized by the part of the application each folder is responsible for:

```text
CareerForageAi/
|-- frontend/                 React + Vite website
|   |-- src/
|   |   |-- app/              App routes and dashboard layout
|   |   |-- components/auth/  Login and registration screens
|   |   |-- components/practice/ Practice questions and attempt feedback
|   |   |-- components/resume/ Resume-first onboarding and resume pages
|   |   |-- contexts/         Authentication and theme state
|   |   |-- services/         Frontend API requests
|   |   |-- styles/           Global styles
|   |   `-- main.jsx          Frontend entry point
|   |-- public/               Static images and icons
|   |-- package.json          Frontend dependencies and commands
|   `-- vite.config.js        Local frontend server and API proxy
|-- backend/                  Python + FastAPI web service
|   |-- routers/              API endpoints grouped by feature
|   |-- main.py               Creates the API and connects the endpoint groups
|   |-- security.py           Password hashing and login tokens
|   |-- schemas.py            Validates API request data
|   |-- serializers.py        Converts database rows to API responses
|   |-- config.py             Reads backend/.env settings
|   |-- jobs_feed.py          Fetches and caches Adzuna job listings
|   |-- gemini.py             Server-side Gemini requests and response validation
|   `-- requirements.txt      Python dependencies
|-- database/                 SQLite data and database setup
|   |-- schema.sql            Table definitions
|   |-- practice_seed.py      Starter practice question bank
|   |-- initialize.py         Creates tables, migrates, and seeds practice questions
|   |-- connection.py         Opens and closes SQLite connections
|   `-- careerforge.db        Created automatically on first backend startup
`-- README.md                 Project setup and folder guide
```

## What talks to what?

1. The **frontend** displays CareerForge and sends HTTP requests to `/api`.
2. The **backend** validates requests, checks authentication when needed, and performs the requested operation.
3. The **database** stores accounts, resume metadata, practice attempts, jobs, applications, and saved jobs. Its tables are defined in `database/schema.sql`.

Inside the frontend, `src/app/` wires pages together, `src/components/` contains UI pieces, `src/contexts/` shares app state, and `src/services/` talks to the API.

The browser app does not connect directly to SQLite. All database access goes through the backend API.

## Resume-first accounts and real progress

- Every new or returning account without a current resume is sent to onboarding before the dashboard.
- Upload a text-based PDF or DOCX (maximum 8 MB). After explicit consent, extracted resume text—not the original file—is sent to Google Gemini for profile analysis. If Gemini is unavailable, the app clearly reports that it used local extraction instead. Scanned/image-only PDFs need OCR and are not supported.
- Review, edit, or re-analyze extracted profile fields on **Profile**. Resume section coverage counts six populated sections (headline, education, skills, experience, projects, and certifications). It does not test ATS parsing or predict hiring outcomes.
- **Aptitude** records your selected answers. **Coding Practice** is practice-only: write and save a solution, and CareerForge counts it as practiced without executing or judging it. **Interview Preparation** sends a written question and answer to Gemini only after you consent, for AI-generated practice feedback—not a hiring decision.
- Skill scores start at 0 and are calculated from completed, scored practice attempts. Coding attempts are counted as practice, not presented as an automatically judged score.
- The resume builder uses your profile details and browser print dialog; choose **Save as PDF** to download a generated PDF. You can also download your original uploaded file.
- The resume builder lets you add and edit your own contact details, summary, education, skills, experience, projects, certifications, languages, and preferred roles. Review the preview before printing; do not include claims you cannot verify.
- Job listings are refreshed from Adzuna's India API for Bengaluru, Hyderabad, and Chennai within 50 km, with AI/ML and other technical-role search terms. The feed keeps listings from up to 30 distinct employers, prioritizes AI/ML roles, and caches results for six hours. Listings are attributed and linked to the original post; confirm availability and employer details there.
- **Job applications:** upload multiple PDF/DOCX resumes on **Profile**, choose one for a job, and confirm before continuing. CareerForge stores the selected resume reference in your private application tracker, then links to the original employer page. It does not send the resume or profile details and no authorized employer submission integration is configured. The new record starts as **Ready to apply**, not Applied; after submitting through the employer, update the tracker yourself. CareerForge does not scrape employer pages or claim an external submission.
- Practice content includes 40 aptitude questions and 30 coding exercises. Company tags describe commonly associated interview practice and do not imply these exact questions were asked by a company.

Uploaded resume files are stored under `database/uploads/` and are excluded from Git. Do not put real personal resumes in a repository or share its upload directory.

## Run locally (Windows)

Open two PowerShell terminals in the project root.

### Terminal 1: start the backend

The Python virtual environment and `backend/.env` are already project-local. If setting up a fresh copy:

```powershell
py -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
```

For a fresh copy, set `CAREERFORGE_SECRET_KEY` in `backend\.env` to a private random value at least 32 characters long. Generate one with:

```powershell
py -c "import secrets; print(secrets.token_urlsafe(32))"
```

Start the API from the project root:

```powershell
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

The API is at `http://127.0.0.1:8000`; its interactive docs are at `http://127.0.0.1:8000/docs`.

To enable the provider-backed features, add these values to the private
`backend/.env` file:

```text
ADZUNA_APP_ID=your-adzuna-app-id
ADZUNA_APP_KEY=your-adzuna-app-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

Adzuna requires both credentials. Gemini feedback and resume analysis require
its API key. Never put provider keys in frontend environment variables. Resume
text and interview answers are sent to Google Gemini only after the user checks
the relevant consent box. Provider availability, quotas, and data policies apply.

### Terminal 2: start the frontend

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL (usually `http://localhost:5173`). The Vite development server forwards `/api` requests to FastAPI.

Run frontend checks from `frontend/`:

```powershell
npm run lint
npm run build
```

### Browser tests

Playwright tests start the frontend and a dedicated FastAPI test server. The API
uses a temporary SQLite database and temporary resume-upload directory; seeded
job listings and generated accounts/resumes are test-only data. Your regular
database and uploaded resumes are not used by the test server.

Run the browser suite from `frontend/`:

```powershell
npm run test:e2e
```

Run the backend provider-adapter tests from the project root (all network
responses are mocked):

```powershell
backend\.venv\Scripts\python.exe -m unittest backend.tests.test_provider_adapters
```

Run with a visible browser or Playwright UI:

```powershell
npm run test:e2e:headed
npm run test:e2e:ui
```

The suite uses isolated provider stubs; it does not call Adzuna or Gemini, and
therefore does not validate live credentials or provider quotas.
It requires the project-local backend environment at
`backend\.venv\Scripts\python.exe` on Windows (or `backend/.venv/bin/python` on
macOS/Linux), plus the installed Playwright browser binaries. Reports and failure
artifacts are written to `frontend\playwright-report\` and
`frontend\test-results\`.

## Main API routes

- Authentication: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- Jobs: `GET /api/jobs`, `GET /api/jobs/{job_id}`
- Applications: `GET /api/applications`, `POST /api/applications` (owned `resume_id` and explicit confirmation required), `PATCH /api/applications/{id}`
- Saved jobs: `GET /api/saved-jobs`, `POST /api/saved-jobs/{job_id}`, `DELETE /api/saved-jobs/{job_id}`
- Profile and resumes: `GET/PATCH /api/profile`, `POST /api/profile/resume`, `POST /api/profile/resumes/{resume_id}/reanalyze`, `GET /api/profile/resumes/{resume_id}/download`
- Practice: `GET /api/practice/questions`, `POST /api/practice/attempts`, `GET /api/practice/progress`

## Local data and secrets

`backend/.env` is private local configuration and must not be shared or committed. It sets the JWT secret and `CAREERFORGE_DB_PATH=database/careerforge.db`. SQLite data is stored in `database/careerforge.db`; that file is generated automatically and ignored by Git. The database is local development storage, not a hosted service.

For deployment, set a private secret in the hosting environment, configure CORS for the actual frontend URL, use HTTPS, and consider moving from SQLite to a managed database.
