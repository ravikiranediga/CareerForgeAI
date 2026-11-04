import os
import sys
from datetime import datetime, timezone
from pathlib import Path


project_root = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(project_root))

from database.initialize import initialize_database
from database.connection import db_session


def seed_jobs():
    synced_at = datetime.now(timezone.utc).isoformat()
    jobs = [
        ("Python Developer", "Example Labs", "Remote", "Remote", "Entry level", "Not specified", "Python,FastAPI", "Full-time"),
        ("Data Analyst", "Northwind Systems", "Hyderabad, Telangana", "Location-based", "Junior", "Not specified", "SQL,Python", "Full-time"),
        ("Machine Learning Engineer", "Acme AI", "Bengaluru, Karnataka", "Location-based", "Mid-level", "Not specified", "Python,PyTorch", "Full-time"),
    ]
    with db_session() as connection:
        for index, (title, company, location, work_mode, experience, salary, skills, job_type) in enumerate(jobs, 1):
            connection.execute(
                """
                INSERT INTO jobs (
                    title, company, location, work_mode, experience, salary, skills,
                    posted, job_type, color, description, responsibilities, requirements,
                    benefits, company_info, source, external_id, job_url, listed_at, synced_at,
                    is_active
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Today', ?, '#4f46e5', ?, '', '', '', ?, 'Adzuna',
                    ?, ?, ?, ?, 1)
                """,
                (
                    title,
                    company,
                    location,
                    work_mode,
                    experience,
                    salary,
                    skills,
                    job_type,
                    f"Test listing for the {title} role.",
                    "Seeded test data; not a real vacancy.",
                    f"careerforge-e2e-job-{index}",
                    f"https://jobs.example.test/careerforge-e2e-job-{index}",
                    synced_at,
                    synced_at,
                ),
            )


def main():
    if not os.environ.get("CAREERFORGE_E2E_ROOT"):
        raise RuntimeError("The test backend must use an isolated Playwright test directory.")

    initialize_database()
    seed_jobs()

    from backend.main import app
    import backend.routers.profile as profile_router
    import backend.routers.practice as practice_router
    import uvicorn

    profile_router.UPLOADS_DIR = Path(os.environ["CAREERFORGE_UPLOADS_DIR"])
    profile_router.analyze_resume = lambda _text: {
        "full_name": "Jordan Playwright",
        "email": "jordan@example.test",
        "phone": "+1 555 010 2020",
        "location": "Bengaluru",
        "headline": "Software Engineer",
        "summary": "Builds reliable software.",
        "education": "Example University",
        "skills": ["Python", "Playwright"],
        "projects": ["Browser test project"],
        "experience": ["QA Engineer"],
        "certifications": ["Testing Basics"],
        "languages": ["English"],
        "preferred_roles": ["Software Engineer"],
    }
    practice_router.analyze_interview_answer = lambda _question, _category, _answer, _language: {
        "overall_score": 82,
        "relevance": 85,
        "clarity": 80,
        "specificity": 81,
        "strengths": ["Relevant example"],
        "areas_to_improve": ["Add a measurable result."],
        "scoring_note": (
            "AI-generated practice feedback based only on the written question and answer. "
            "The overall score is the mean of relevance, clarity, and specificity; it is not "
            "a hiring decision or a guarantee of interview performance."
        ),
    }
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.environ.get("CAREERFORGE_E2E_PORT", "8017")),
        log_level="warning",
    )


if __name__ == "__main__":
    main()
