from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Response, status

from ..security import CurrentUser
from ..serializers import serialize_job
from database.connection import db_session

router = APIRouter(prefix="/api/saved-jobs", tags=["saved jobs"])


@router.get("")
def list_saved_jobs(user: CurrentUser):
    with db_session() as connection:
        rows = connection.execute(
            """
            SELECT j.*, s.saved_at FROM saved_jobs s JOIN jobs j ON j.id = s.job_id
            WHERE s.user_id = ? ORDER BY s.saved_at DESC
            """,
            (user["id"],),
        ).fetchall()
    return [
        {
            **serialize_job(row),
            "saved": datetime.fromisoformat(row["saved_at"]).astimezone(timezone.utc).strftime("%d %b %Y"),
        }
        for row in rows
    ]


@router.post("/{job_id}", status_code=status.HTTP_201_CREATED)
def save_job(job_id: int, user: CurrentUser):
    with db_session() as connection:
        if connection.execute("SELECT id FROM jobs WHERE id = ?", (job_id,)).fetchone() is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        connection.execute(
            "INSERT OR IGNORE INTO saved_jobs (user_id, job_id, saved_at) VALUES (?, ?, ?)",
            (user["id"], job_id, datetime.now(timezone.utc).isoformat()),
        )
    return {"saved": True, "job_id": job_id}


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_saved_job(job_id: int, user: CurrentUser):
    with db_session() as connection:
        connection.execute(
            "DELETE FROM saved_jobs WHERE user_id = ? AND job_id = ?",
            (user["id"], job_id),
        )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
