import json
import logging
import re
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath

from docx.opc.exceptions import PackageNotFoundError
from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from pypdf.errors import PdfReadError

from ..ai_resume import analyze_resume
from ..config import PROJECT_ROOT
from ..gemini import GeminiProviderError
from ..resume_parser import extract_profile, extract_text, profile_completion, section_coverage_score
from ..schemas import ProfileUpdatePayload, ResumeAnalysisConsentPayload
from ..security import CurrentUser
from database.connection import db_session

router = APIRouter(prefix="/api/profile", tags=["profile"])
logger = logging.getLogger(__name__)
UPLOADS_DIR = PROJECT_ROOT / "database" / "uploads"
MAX_RESUME_SIZE = 8 * 1024 * 1024
ALLOWED_EXTENSIONS = {".pdf", ".docx"}


def _current_resume(connection, user_id: int):
    return connection.execute(
        """
        SELECT id, original_name, storage_key, ats_score, uploaded_at
        FROM resumes WHERE user_id = ? AND is_current = 1
        ORDER BY uploaded_at DESC LIMIT 1
        """,
        (user_id,),
    ).fetchone()


def _user_resumes(connection, user_id: int):
    rows = connection.execute(
        """
        SELECT id, original_name, uploaded_at, is_current
        FROM resumes WHERE user_id = ?
        ORDER BY uploaded_at DESC, id DESC
        """,
        (user_id,),
    ).fetchall()
    return [
        {
            "id": row["id"],
            "filename": row["original_name"],
            "uploaded_at": row["uploaded_at"],
            "is_current": bool(row["is_current"]),
            "download_url": f"/api/profile/resumes/{row['id']}/download",
        }
        for row in rows
    ]


def _public_resume(row, profile):
    if row is None:
        return None
    return {
        "id": row["id"],
        "filename": row["original_name"],
        "uploaded_at": row["uploaded_at"],
        "section_coverage": section_coverage_score(profile),
        "download_url": f"/api/profile/resumes/{row['id']}/download",
    }


def _profile_response(user, profile, resume, resumes, analysis_notice: str | None = None):
    has_resume = resume is not None
    return {
        "id": user["id"],
        "name": user["name"],
        "email": user["email"],
        "profile": profile,
        "has_resume": has_resume,
        "profile_completion": profile_completion(profile, has_resume),
        "resume": _public_resume(resume, profile),
        "resumes": resumes,
        "analysis_notice": analysis_notice,
    }


def _analyze_resume_profile(user_row, extracted_text: str):
    profile = json.loads(user_row["profile_json"] or "{}")
    extracted_profile = extract_profile(extracted_text, user_row["name"], user_row["email"])
    profile.update({key: value for key, value in extracted_profile.items() if value})
    try:
        ai_profile = analyze_resume(extracted_text)
    except GeminiProviderError as error:
        logger.warning("Gemini resume analysis unavailable; retaining local extraction.")
        return profile, (
            "Gemini resume analysis was unavailable. CareerForge used local text extraction "
            f"instead. {error.message}"
        )
    profile.update({key: value for key, value in ai_profile.items() if value})
    return profile, "Resume analyzed with Google Gemini. Review the extracted fields for accuracy."


def _persist_resume_analysis(connection, user_row, profile, analysis_notice: str):
    connection.execute(
        "UPDATE users SET profile_json = ? WHERE id = ?",
        (json.dumps(profile), user_row["id"]),
    )
    resume = _current_resume(connection, user_row["id"])
    resumes = _user_resumes(connection, user_row["id"])
    if resume is not None:
        connection.execute(
            "UPDATE resumes SET ats_score = ? WHERE id = ?",
            (section_coverage_score(profile), resume["id"]),
        )
        resume = _current_resume(connection, user_row["id"])
    return _profile_response(user_row, profile, resume, resumes, analysis_notice)


@router.get("")
def get_profile(user: CurrentUser):
    with db_session() as connection:
        row = connection.execute(
            "SELECT id, name, email, profile_json FROM users WHERE id = ?", (user["id"],)
        ).fetchone()
        resume = _current_resume(connection, user["id"])
        resumes = _user_resumes(connection, user["id"])
    profile = json.loads(row["profile_json"] or "{}")
    return _profile_response(row, profile, resume, resumes)


@router.post("/resumes/{resume_id}/reanalyze")
def reanalyze_resume(resume_id: int, payload: ResumeAnalysisConsentPayload, user: CurrentUser):
    if not payload.gemini_consent:
        raise HTTPException(
            status_code=422,
            detail="Consent is required before sending resume text to Google Gemini.",
        )
    with db_session() as connection:
        resume = connection.execute(
            """
            SELECT extracted_text FROM resumes
            WHERE id = ? AND user_id = ? AND is_current = 1
            """,
            (resume_id, user["id"]),
        ).fetchone()
        if resume is None:
            raise HTTPException(status_code=404, detail="Current resume not found.")
        user_row = connection.execute(
            "SELECT id, name, email, profile_json FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
        extracted_text = resume["extracted_text"]

    profile, analysis_notice = _analyze_resume_profile(user_row, extracted_text)
    with db_session() as connection:
        current_resume = _current_resume(connection, user["id"])
        if current_resume is None or current_resume["id"] != resume_id:
            raise HTTPException(status_code=404, detail="Current resume not found.")
        user_row = connection.execute(
            "SELECT id, name, email, profile_json FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
        return _persist_resume_analysis(connection, user_row, profile, analysis_notice)


@router.patch("")
def update_profile(payload: ProfileUpdatePayload, user: CurrentUser):
    with db_session() as connection:
        row = connection.execute(
            "SELECT id, name, email, profile_json FROM users WHERE id = ?", (user["id"],)
        ).fetchone()
        profile = json.loads(row["profile_json"] or "{}")
        changes = payload.model_dump(exclude_unset=True)
        for key, value in changes.items():
            if isinstance(value, str):
                value = value.strip()
            elif isinstance(value, list):
                value = [item.strip() for item in value if item.strip()]
            profile[key] = value
        connection.execute(
            "UPDATE users SET profile_json = ? WHERE id = ?",
            (json.dumps(profile), user["id"]),
        )
        resume = _current_resume(connection, user["id"])
        resumes = _user_resumes(connection, user["id"])
        if resume is not None:
            connection.execute(
                "UPDATE resumes SET ats_score = ? WHERE id = ?",
                (section_coverage_score(profile), resume["id"]),
            )
        resume = _current_resume(connection, user["id"])
        resumes = _user_resumes(connection, user["id"])
    return _profile_response(row, profile, resume, resumes)


@router.post("/resume", status_code=status.HTTP_201_CREATED)
async def upload_resume(
    user: CurrentUser,
    file: UploadFile = File(...),
    gemini_consent: bool = Form(default=False),
):
    if not gemini_consent:
        raise HTTPException(
            status_code=422,
            detail="Consent is required before sending resume text to Google Gemini.",
        )
    filename = Path((file.filename or "").replace("\\", "/")).name
    extension = Path(filename).suffix.lower()
    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=415, detail="Upload a PDF or DOCX resume.")
    if not filename or len(filename) > 200:
        raise HTTPException(status_code=422, detail="The resume filename is invalid.")

    file_bytes = await file.read(MAX_RESUME_SIZE + 1)
    if len(file_bytes) > MAX_RESUME_SIZE:
        raise HTTPException(status_code=413, detail="Resume file must be 8 MB or smaller.")
    if extension == ".pdf" and not file_bytes.startswith(b"%PDF-"):
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid PDF.")
    if extension == ".docx" and not file_bytes.startswith(b"PK"):
        raise HTTPException(status_code=415, detail="The uploaded file is not a valid DOCX document.")
    try:
        extracted = extract_text(filename, file_bytes)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error))
    except (PdfReadError, PackageNotFoundError, zipfile.BadZipFile):
        raise HTTPException(status_code=422, detail="The resume could not be read. Try a valid PDF or DOCX file.")

    with db_session() as connection:
        user_row = connection.execute(
            "SELECT id, name, email, profile_json FROM users WHERE id = ?", (user["id"],)
        ).fetchone()
    profile, analysis_notice = _analyze_resume_profile(user_row, extracted)

    destination = None
    try:
        with db_session() as connection:
            user_row = connection.execute(
                "SELECT id, name, email, profile_json FROM users WHERE id = ?", (user["id"],)
            ).fetchone()
            storage_key = f"{user['id']}/{uuid.uuid4().hex}{extension}"
            destination = UPLOADS_DIR / storage_key
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(file_bytes)
            uploaded_at = datetime.now(timezone.utc).isoformat()
            connection.execute("UPDATE resumes SET is_current = 0 WHERE user_id = ?", (user["id"],))
            connection.execute(
                """
                INSERT INTO resumes (user_id, original_name, storage_key, extracted_text, ats_score, uploaded_at)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (user["id"], filename, storage_key, extracted, 0, uploaded_at),
            )
            profile_response = _persist_resume_analysis(connection, user_row, profile, analysis_notice)
    except Exception:
        if destination is not None and destination.is_file():
            destination.unlink()
        raise

    return profile_response


@router.get("/resumes/{resume_id}/download")
def download_resume(resume_id: int, user: CurrentUser):
    with db_session() as connection:
        resume = connection.execute(
            "SELECT original_name, storage_key FROM resumes WHERE id = ? AND user_id = ?",
            (resume_id, user["id"]),
        ).fetchone()
    if resume is None:
        raise HTTPException(status_code=404, detail="Resume not found.")

    relative_key = PurePosixPath(resume["storage_key"])
    if relative_key.is_absolute() or ".." in relative_key.parts:
        raise HTTPException(status_code=400, detail="Invalid stored resume path.")
    path = (UPLOADS_DIR / Path(*relative_key.parts)).resolve()
    if not path.is_relative_to(UPLOADS_DIR.resolve()) or not path.is_file():
        raise HTTPException(status_code=404, detail="Resume file is missing.")
    media_type = "application/pdf" if path.suffix == ".pdf" else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    safe_filename = re.sub(r"[\r\n\"]", "", resume["original_name"])
    return FileResponse(path, filename=safe_filename, media_type=media_type)
