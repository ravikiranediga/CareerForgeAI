import re

from fastapi import APIRouter, HTTPException, Query, status

from ..jobs_feed import FEED_SOURCE, refresh_job_cache
from ..serializers import serialize_job
from database.connection import db_session

router = APIRouter(prefix="/api/jobs", tags=["jobs"])


def _search_terms(query: str) -> list[str]:
    terms = [query.strip()]
    normalized = re.sub(r"[^a-z0-9]+", " ", query.casefold()).strip()
    if re.search(r"\b(ai|aiml|ml|ai ml|machine learning|artificial intelligence)\b", normalized):
        terms.extend(("AI/ML", "AI", "ML", "AIML", "machine learning", "artificial intelligence"))
    return list(dict.fromkeys(term for term in terms if term))


def _location_terms(location: str) -> list[str]:
    terms = [location.strip()]
    normalized = location.casefold()
    if "bangalore" in normalized:
        terms.append("Bengaluru")
    elif "bengaluru" in normalized:
        terms.append("Bangalore")
    return terms


@router.get("")
def list_jobs(
    q: str = Query(default="", max_length=100),
    location: str | None = Query(default=None, max_length=100),
    experience: str | None = None,
    work_mode: str | None = None,
    job_type: str | None = None,
):
    try:
        stale, feed_warning = refresh_job_cache()
    except RuntimeError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error))

    clauses = []
    parameters = []
    if q.strip():
        terms = _search_terms(q)
        search_clauses = []
        for term in terms:
            search = f"%{term}%"
            search_clauses.append("(title LIKE ? OR company LIKE ? OR skills LIKE ? OR description LIKE ?)")
            parameters.extend([search, search, search, search])
        clauses.append(f"({' OR '.join(search_clauses)})")
    if location and location != "All":
        location_clauses = []
        for term in _location_terms(location):
            location_clauses.append("location LIKE ?")
            parameters.append(f"%{term}%")
        clauses.append(f"({' OR '.join(location_clauses)})")
    for column, value in (
        ("experience", experience),
        ("work_mode", work_mode),
        ("job_type", job_type),
    ):
        if value and value != "All":
            clauses.append(f"{column} = ?")
            parameters.append(value)
    with db_session() as connection:
        rows = connection.execute(
            f"""
            SELECT * FROM jobs
            WHERE source = ? AND is_active = 1
            {"AND " + " AND ".join(clauses) if clauses else ""}
            ORDER BY listed_at DESC, company COLLATE NOCASE
            """,
            [FEED_SOURCE, *parameters],
        ).fetchall()
    jobs = [serialize_job(row) for row in rows]
    for job in jobs:
        job["sourceStale"] = stale
        job["sourceWarning"] = feed_warning
    return jobs


@router.get("/{job_id}")
def get_job(job_id: int):
    with db_session() as connection:
        job = connection.execute(
            "SELECT * FROM jobs WHERE id = ? AND source = ? AND is_active = 1",
            (job_id, FEED_SOURCE),
        ).fetchone()
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found.")
    return serialize_job(job)
