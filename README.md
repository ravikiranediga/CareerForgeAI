# CareerForge – AI-Powered Career Preparation & Job Tracking Platform

**Discover opportunities. Build your skills. Prepare for interviews. Take control of your career.**

CareerForge is a resume-first career preparation platform designed to bring job discovery, interview preparation, skill development, resume management, and application tracking together in one place.

Built with **React, FastAPI, and SQLite**, CareerForge integrates the Adzuna API for India-focused job listings and offers optional Gemini-powered resume and interview feedback with user consent.

> **Project type:** B.Tech Final-Year Project | Full-Stack Web Application  
> **Development status:** Portfolio and local-development project

---

## Overview

Finding a job involves more than searching for vacancies. Candidates also need to maintain a strong resume, practice technical and aptitude questions, prepare for interviews, and keep track of applications.

CareerForge aims to simplify this process through a unified dashboard that helps candidates organize their job search and career preparation.

## Key Features

### 1. Career Dashboard
- Centralized dashboard for career activities.
- Profile completion and career-readiness indicators.
- Quick access to job search, practice, and interview preparation.
- Application and practice progress overview.

### 2. Job Discovery
- Search job opportunities using the Adzuna API.
- Focus on India-based opportunities, including technical and AI/ML roles.
- Explore listings with job details and original posting links.
- Save interesting opportunities for later.

### 3. Resume Builder & Analysis
- Upload text-based PDF and DOCX resumes.
- Extract resume information and build a career profile.
- Preview resume information in an organized format.
- Review populated resume sections and identify missing information.
- Download or print the resume through the browser.

### 4. Aptitude Preparation
- Practice quantitative aptitude and reasoning questions.
- Work through structured practice questions.
- Review attempts and practice progress.

### 5. Coding Practice
- Practice programming questions and problem-solving exercises.
- Explore languages including Python, Java, C, C++, and JavaScript.
- Work through coding exercises at your own pace.

> Coding practice is intentionally practice-only. Solutions are not executed or automatically judged.

### 6. Interview Preparation
- Practice technical and HR interview questions.
- Prepare responses to common interview prompts.
- Receive optional Gemini-powered feedback with explicit consent.

### 7. Application Tracking
- Track job applications through a centralized interface.
- Maintain application statuses and review progress.
- Select a saved resume before opening an employer's application page.
- Update application outcomes manually.

### 8. User Profile & Progress
- Manage personal career information.
- Maintain uploaded resumes.
- Review practice activity and progress.
- Keep career-related information organized.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React, JavaScript, React Router |
| Build Tool | Vite |
| Backend | Python, FastAPI |
| API Server | Uvicorn |
| Database | SQLite |
| Job Data Integration | Adzuna API |
| AI Integration | Google Gemini API |
| Authentication | JWT-based authentication |
| Testing | Python unittest, Playwright |
| Code Quality | Oxlint |

---

## System Architecture

CareerForge follows a frontend-backend architecture.

```text
                USER
                  |
                  v
        REACT FRONTEND (VITE)
                  |
                  | HTTP / REST API
                  v
          FASTAPI BACKEND
                  |
       +----------+-----------+
       |          |           |
       v          v           v
    SQLITE     ADZUNA       GEMINI
   DATABASE      API          API
       |
       v
 USER DATA, RESUMES,
 APPLICATIONS & PROGRESS
```

**Architecture highlights:**
- React handles the user interface and navigation.
- FastAPI provides backend services and REST API endpoints.
- SQLite stores application data.
- Adzuna supplies external job listing information.
- Gemini provides optional AI-powered feedback.
- The backend handles authentication, validation, database operations, and external provider requests.

The browser communicates with the backend through `/api`. It does not connect directly to SQLite.

---

## Project Structure

```text
CareerForge/
│
├── frontend/
│   ├── src/
│   ├── tests/
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   ├── tests/
│   └── ...
│
├── database/
│   ├── schema.sql
│   └── ...
│
├── .gitignore
└── README.md
```

*The structure above is a simplified overview. Individual folders may contain additional files.*

---

## Getting Started

Follow these steps to run CareerForge locally on Windows.

### Prerequisites

Install the following:

- Python 3.10 or later
- Node.js and npm
- Git (optional)

### Step 1: Clone the Repository

```bash
git clone https://github.com/ravikiranediga/CareerForgeAI.git
cd CareerForgeAI
```

### Step 2: Set Up the Backend

Create a Python virtual environment:

```powershell
py -m venv backend\.venv
```

Install dependencies:

```powershell
backend\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Create your local environment file:

```powershell
Copy-Item backend\.env.example backend\.env
```

### Step 3: Configure Environment Variables

Generate a secure application secret:

```powershell
py -c "import secrets; print(secrets.token_urlsafe(32))"
```

Add the generated secret to `backend\.env`.

Optional provider configuration:

```dotenv
ADZUNA_APP_ID=your-adzuna-app-id
ADZUNA_APP_KEY=your-adzuna-app-key

GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-2.5-flash
```

- Adzuna credentials enable provider-backed job listings.
- Gemini credentials enable optional AI feedback.
- Keep all real credentials inside `backend/.env`.
- Never commit your `.env` file to GitHub.

### Step 4: Start the Backend

From the project root:

```powershell
backend\.venv\Scripts\python.exe -m uvicorn backend.main:app --reload
```

Backend URL:

`http://127.0.0.1:8000`

Interactive API documentation:

`http://127.0.0.1:8000/docs`

### Step 5: Start the Frontend

Open another terminal:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL shown by Vite, usually:

`http://localhost:5173`

---

## Testing & Quality Checks

CareerForge includes automated checks for frontend, backend, and browser workflows.

### Frontend linting

```powershell
cd frontend
npm run lint
```

### Production build

```powershell
npm run build
```

### Backend tests

From the project root:

```powershell
backend\.venv\Scripts\python.exe -m unittest backend.tests.test_provider_adapters
```

### End-to-end browser tests

From the frontend directory:

```powershell
npm run test:e2e
```

The Playwright suite uses isolated test data and provider stubs. It does not verify live provider availability or credentials.

---

## Privacy & Security

CareerForge follows a privacy-conscious development approach.

- API credentials are stored in backend environment variables.
- Real `.env` files are excluded from Git.
- Passwords are handled through backend authentication and hashing.
- User-specific resume and application records are scoped to authenticated users.
- Gemini requests involving resume text or interview answers require user consent.
- Uploaded resumes and SQLite databases are local application data and must not be published.
- Job applications are opened on the employer's original website; CareerForge does not submit them.

**Never publish API keys, passwords, authentication tokens, private resumes, or personal user data.**

---

## Current Project Scope & Limitations

To keep the project transparent:

- Job listings are supplied by Adzuna and may be cached.
- Users must verify job availability on the original employer posting.
- CareerForge does not automatically submit job applications.
- Application statuses are updated manually by users.
- Coding solutions are not executed or automatically evaluated.
- Gemini feedback is advisory and depends on provider availability and quotas.
- Resume section coverage is not a genuine ATS compatibility score.
- Scanned PDFs requiring OCR are not supported.
- The current SQLite setup is intended for local development, not production-scale hosting.

---

## Future Enhancements

Potential future improvements include:

- Authorized employer ATS integrations for application submission.
- Employer-supported application status webhooks.
- Optional email integration for application status detection, with explicit user consent.
- More advanced coding evaluation through a secure execution service.
- Additional resume templates and export formats.
- Personalized learning recommendations.
- Production deployment with persistent storage and monitoring.

These are planned enhancements, not claims about currently implemented functionality.

---

## Project Information

**Project Name:** CareerForge  
**Category:** Full-Stack Web Development / Career Technology  
**Project Level:** B.Tech Final-Year Project  
**Frontend:** React  
**Backend:** FastAPI  
**Database:** SQLite

**GitHub Repository:**  
https://github.com/ravikiranediga/CareerForgeAI

---

## Acknowledgement

CareerForge is developed as an academic and portfolio project to explore full-stack web development, external API integration, AI-assisted feedback, and practical career preparation tools.

**CareerForge – Build your skills. Prepare with confidence. Move your career forward.**
