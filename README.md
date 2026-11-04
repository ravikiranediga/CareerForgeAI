# CareerForge

**A resume-first career preparation platform for job discovery, interview practice, and application tracking.**

CareerForge brings practical job-search and preparation tools into one application. It combines a React frontend with a FastAPI backend, uses Adzuna for India-focused job listings, and offers optional Gemini-powered feedback with user consent.

> **Project scope:** CareerForge is a portfolio and local-development project. Coding practice is intentionally practice-only, and applications are tracked by the user rather than submitted by CareerForge.

## What it does

- **Build a career profile from your resume.** Upload a text-based PDF or DOCX, review extracted details, and create a resume preview from your profile. Scanned PDFs requiring OCR are not supported.
- **Find relevant jobs.** Search Adzuna India listings, with a focus on technical and AI/ML roles in Bengaluru, Hyderabad, and Chennai. Listings link to the original posting so you can verify details and availability.
- **Prepare at your own pace.** Practice aptitude questions, work through coding exercises, and rehearse interview answers. Coding solutions are saved as practice and are not executed or automatically scored.
- **Get optional AI feedback.** With explicit consent, send resume text or an interview answer to Gemini for analysis or practice feedback. AI output is advisory; it is not an ATS score, hiring decision, or guarantee of results.
- **Track applications.** Choose one of your saved resumes, confirm before continuing, and open the employer's original application page. CareerForge records the application as **Ready to apply**; update its status yourself after applying.
- **Keep your work organized.** Save jobs, manage your profile and resumes, and review practice progress in one place.

## Product boundaries

- CareerForge does **not** execute coding submissions or judge their correctness.
- CareerForge does **not** submit applications or share resumes with employers. No authorized employer submission integration is configured.
- Gemini features require a configured API key and your consent for each relevant submission. Provider availability, quotas, and data policies apply.
- Resume section coverage reflects populated profile sections. It does not measure ATS compatibility or predict hiring outcomes.
- Job data comes from Adzuna and may be cached; always check the linked employer posting for current details.

## Technology

| Area | Technologies |
|---|---|
| Frontend | React, React Router, Vite |
| Backend | Python, FastAPI, Uvicorn |
| Data | SQLite |
| Job listings | Adzuna API |
| Optional AI feedback | Google Gemini API |
| Quality checks | Oxlint, Python `unittest`, Playwright |

## How it is structured

```text
frontend/       React application, API client, and Playwright tests
backend/        FastAPI application, feature routers, and provider adapters
database/       SQLite schema, initialization, and practice seed data
```

The browser communicates with the backend over `/api`. The backend handles validation, authentication, provider requests, and database access; the browser never connects directly to SQLite. In local development, Vite proxies `/api` requests to FastAPI.

## Run locally on Windows

### Prerequisites

- Python 3.10 or later
- Node.js and npm
- Git (optional)

### 1. Configure and start the backend

From the project root, create a virtual environment, install dependencies, and create your local environment file:

```powershell
py -m venv backend\.venv
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
```

Set a private `CAREERFORGE_SECRET_KEY` in `backend\.env`. Generate a random value with:

```powershell
py -c "import secrets; print(secrets.token_urlsafe(32))"
```

To enable job listings and AI features, add your own Adzuna and Gemini credentials to `backend\.env`:

```dotenv
ADZUNA_APP_ID=your-adzuna-app-id
ADZUNA_APP_KEY=your-adzuna-app-key
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

Adzuna listings need both Adzuna values; Gemini feedback needs a Gemini API key. These integrations are optional for running the application, but their provider-backed features will be unavailable without valid credentials.

Start the API from the project root:

```powershell
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

The API runs at `http://127.0.0.1:8000`; interactive API documentation is available at `http://127.0.0.1:8000/docs`.

### 2. Start the frontend

In a second terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal (typically `http://localhost:5173`).

## Run checks

From `frontend\`, run the frontend linter and production build:

```powershell
npm run lint
npm run build
```

Run the backend provider-adapter tests from the project root:

```powershell
backend\.venv\Scripts\python.exe -m unittest backend.tests.test_provider_adapters
```

Run the Playwright browser suite from `frontend\`:

```powershell
npm run test:e2e
```

The browser suite uses isolated test data and provider stubs; it does not validate live provider credentials, quotas, or availability. Playwright browser binaries may need to be installed separately on a fresh machine.

## Privacy and security

- Keep `backend\.env` private. Never commit API keys, passwords, tokens, or real user data.
- Provider keys belong only in the backend environment; do not put them in frontend code or frontend environment variables.
- Resume text and interview answers are sent to Gemini only after the user gives the relevant consent.
- Uploaded resumes and the SQLite database are local application data and should not be published.
- Resume records and application tracking are scoped to the authenticated user. Confirm before continuing to an employer application page.
- For deployment, use HTTPS, set a strong private secret, configure CORS for the deployed frontend, and choose storage appropriate for production. The included SQLite setup is for local development, not a hosted production database.

## API overview

| Feature | Example routes |
|---|---|
| Authentication | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| Jobs | `GET /api/jobs`, `GET /api/jobs/{job_id}` |
| Applications | `GET /api/applications`, `POST /api/applications`, `PATCH /api/applications/{id}` |
| Saved jobs | `GET /api/saved-jobs`, `POST /api/saved-jobs/{job_id}`, `DELETE /api/saved-jobs/{job_id}` |
| Profile and resumes | `GET/PATCH /api/profile`, `POST /api/profile/resume`, `GET /api/profile/resumes/{resume_id}/download` |
| Practice | `GET /api/practice/questions`, `POST /api/practice/attempts`, `GET /api/practice/progress` |

For the complete interactive schema, start the backend and visit `/docs`.
