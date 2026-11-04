import sqlite3
from datetime import datetime, timezone
from urllib.parse import urlparse

from fastapi import APIRouter, HTTPException, status

from ..schemas import ApplicationPayload, ApplicationStatusPayload
from ..security import CurrentUser
from ..serializers import serialize_application
from database.connection import db_session

router = APIRouter(prefix="/api/applications", tags=["applications"])


def get_application_row(connection, application_id: int):
    return connection.execute(
        """
        SELECT a.id, a.job_id, a.resume_id, a.resume_name, a.status, a.applied_at,
               j.company, j.title, j.job_url
        FROM applications a JOIN jobs j ON j.id = a.job_id WHERE a.id = ?
        """,
        (application_id,),
    ).fetchone()


@router.get("")
def list_applications(user: CurrentUser):
    with db_session() as connection:
        rows = connection.execute(
            """
            SELECT a.id, a.job_id, a.resume_id, a.resume_name, a.status, a.applied_at,
                   j.company, j.title, j.job_url
            FROM applications a JOIN jobs j ON j.id = a.job_id
            WHERE a.user_id = ? ORDER BY a.applied_at DESC
            """,
            (user["id"],),
        ).fetchall()
    return [serialize_application(row) for row in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_application(payload: ApplicationPayload, user: CurrentUser):
    if not payload.confirmed_external_sharing:
        raise HTTPException(
            status_code=422,
            detail="Confirm before continuing to the employer application page.",
        )
    confirmed_at = datetime.now(timezone.utc).isoformat()
    with db_session() as connection:
        job = connection.execute(
            "SELECT id, job_url FROM jobs WHERE id = ? AND is_active = 1",
            (payload.job_id,),
        ).fetchone()
        if job is None:
            raise HTTPException(status_code=404, detail="Job not found.")
        resume = connection.execute(
            """
            SELECT id, original_name FROM resumes
            WHERE id = ? AND user_id = ?
            """,
            (payload.resume_id, user["id"]),
        ).fetchone()
        if resume is None:
            raise HTTPException(status_code=404, detail="Resume not found.")
        parsed_url = urlparse(job["job_url"])
        if parsed_url.scheme != "https" or not parsed_url.hostname or parsed_url.username or parsed_url.password:
            raise HTTPException(status_code=422, detail="The employer application link is unavailable.")
        try:
            cursor = connection.execute(
                """
                INSERT INTO applications (
                    user_id, job_id, resume_id, resume_name, status, applied_at, sharing_confirmed_at
                ) VALUES (?, ?, ?, ?, 'Ready to apply', ?, ?)
                """,
                (
                    user["id"],
                    payload.job_id,
                    resume["id"],
                    resume["original_name"],
                    confirmed_at,
                    confirmed_at,
                ),
            )
        except sqlite3.IntegrityError as error:
            if "UNIQUE constraint failed" in str(error):
                raise HTTPException(status_code=409, detail="You have already applied to this job.")
            raise
        row = get_application_row(connection, cursor.lastrowid)
    return serialize_application(row)


@router.patch("/{application_id}")
def update_application(
    application_id: int,
    payload: ApplicationStatusPayload,
    user: CurrentUser,
):
    with db_session() as connection:
        cursor = connection.execute(
            "UPDATE applications SET status = ? WHERE id = ? AND user_id = ?",
            (payload.status, application_id, user["id"]),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail="Application not found.")
        row = get_application_row(connection, application_id)
    return serialize_application(row)
