import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status

from ..schemas import LoginPayload, RegisterPayload
from ..security import CurrentUser, auth_response, hash_password, verify_password
from database.connection import db_session

router = APIRouter(prefix="/api/auth", tags=["authentication"])


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterPayload):
    name = payload.name.strip()
    email = str(payload.email).lower()
    if len(name) < 2:
        raise HTTPException(status_code=422, detail="Name must contain at least two characters.")
    try:
        with db_session() as connection:
            cursor = connection.execute(
                "INSERT INTO users (name, email, password_hash, created_at) VALUES (?, ?, ?, ?)",
                (name, email, hash_password(payload.password), datetime.now(timezone.utc).isoformat()),
            )
            user = {"id": cursor.lastrowid, "name": name, "email": email}
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")
    return auth_response(user)


@router.post("/login")
def login(payload: LoginPayload):
    with db_session() as connection:
        user = connection.execute(
            """
            SELECT u.id, u.name, u.email, u.password_hash,
                EXISTS(
                    SELECT 1 FROM resumes r
                    WHERE r.user_id = u.id AND r.is_current = 1
                ) AS has_resume
            FROM users u WHERE u.email = ?
            """,
            (str(payload.email).lower(),),
        ).fetchone()
    if user is None or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Email or password is incorrect.")
    return auth_response(dict(user))


@router.get("/me")
def read_current_user(user: CurrentUser):
    return user
