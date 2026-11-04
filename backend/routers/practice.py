import json
import threading
import time
from datetime import datetime, timezone
from statistics import mean
from typing import Literal

from fastapi import APIRouter, HTTPException, Query

from ..ai_interview import InterviewProviderError, analyze_interview_answer
from ..schemas import PracticeAttemptPayload
from ..security import CurrentUser
from database.connection import db_session

router = APIRouter(prefix="/api/practice", tags=["practice"])
_provider_calls = {}
_provider_calls_lock = threading.Lock()
TECHNICAL_CATEGORIES = {
    "Programming",
    "OOP",
    "Data Structures",
    "DBMS",
    "Operating Systems",
    "Computer Networks",
    "AI/ML",
}


def _enforce_provider_limit(user_id: int, provider: str, limit: int = 5, window_seconds: int = 60):
    now = time.monotonic()
    key = (user_id, provider)
    with _provider_calls_lock:
        calls = [timestamp for timestamp in _provider_calls.get(key, []) if now - timestamp < window_seconds]
        if len(calls) >= limit:
            raise HTTPException(status_code=429, detail="Please wait before requesting more provider feedback.")
        calls.append(now)
        _provider_calls[key] = calls
        if len(_provider_calls) > 1_000:
            for old_key, old_calls in list(_provider_calls.items()):
                active_calls = [timestamp for timestamp in old_calls if now - timestamp < window_seconds]
                if active_calls:
                    _provider_calls[old_key] = active_calls
                else:
                    _provider_calls.pop(old_key, None)


def _attempt_count(connection, user_id: int, kind: str, category: str | None = None) -> int:
    if category:
        row = connection.execute(
            """
            SELECT COUNT(*) AS count FROM practice_attempts a
            JOIN practice_questions q ON q.id = a.question_id
            WHERE a.user_id = ? AND a.completed = 1 AND q.kind = ? AND q.category = ?
            """,
            (user_id, kind, category),
        ).fetchone()
    else:
        row = connection.execute(
            """
            SELECT COUNT(*) AS count FROM practice_attempts a
            JOIN practice_questions q ON q.id = a.question_id
            WHERE a.user_id = ? AND a.completed = 1 AND q.kind = ?
            """,
            (user_id, kind),
        ).fetchone()
    return row["count"]


@router.get("/questions")
def list_questions(
    user: CurrentUser,
    kind: Literal["aptitude", "coding", "interview"] = Query(...),
    category: str | None = Query(default=None, max_length=80),
    language: str | None = Query(default=None, max_length=40),
):
    with db_session() as connection:
        rows = connection.execute(
            """
            SELECT q.*,
                (SELECT COUNT(*) FROM practice_attempts a
                 WHERE a.user_id = ? AND a.question_id = q.id AND a.completed = 1) AS attempts,
                (SELECT score FROM practice_attempts a
                 WHERE a.user_id = ? AND a.question_id = q.id AND a.completed = 1
                 ORDER BY completed_at DESC, id DESC LIMIT 1) AS latest_score
            FROM practice_questions q
            WHERE q.kind = ? AND (? IS NULL OR q.category = ?)
            ORDER BY q.id
            """,
            (user["id"], user["id"], kind, category, category),
        ).fetchall()
    questions = []
    for row in rows:
        question = dict(row)
        question["choices"] = json.loads(question["choices_json"]) if question["choices_json"] else None
        question["company_tags"] = [
            tag.strip() for tag in question["company_tags"].split(",") if tag.strip()
        ]
        question["language"] = language if kind == "coding" else None
        question["constraints"] = question.pop("constraints_text")
        question.pop("choices_json")
        question.pop("correct_answer", None)
        question.pop("explanation", None)
        questions.append(question)
    return questions


@router.post("/attempts")
def submit_attempt(payload: PracticeAttemptPayload, user: CurrentUser):
    answer_text = payload.answer_text.strip()
    selected_answer = payload.selected_answer.strip().upper()
    with db_session() as connection:
        question = connection.execute(
            "SELECT * FROM practice_questions WHERE id = ?", (payload.question_id,)
        ).fetchone()
        if question is None:
            raise HTTPException(status_code=404, detail="Practice question not found.")

        kind = question["kind"]
        if kind == "aptitude":
            choices = json.loads(question["choices_json"])
            if selected_answer not in choices:
                raise HTTPException(status_code=422, detail="Choose one of the listed answer options.")
            is_correct = selected_answer == question["correct_answer"]
            score = 100 if is_correct else 0
            feedback = {
                "correct": is_correct,
                "correct_answer": question["correct_answer"],
                "explanation": question["explanation"],
            }
            completed = 1
        elif kind == "coding":
            if len(answer_text) < 20:
                raise HTTPException(
                    status_code=422,
                    detail="Write or paste your solution (at least 20 characters) before marking it practiced.",
                )
            score = None
            completed = 1
            feedback = {
                "note": (
                    "Practice recorded. This saves your code and marks the problem complete; "
                    "CareerForge does not grade its correctness."
                )
            }
        elif kind == "interview":
            if len(answer_text) < 20:
                raise HTTPException(
                    status_code=422,
                    detail="Write an answer of at least 20 characters before requesting feedback.",
                )
            if not payload.ai_consent:
                raise HTTPException(
                    status_code=422,
                    detail="Consent is required before sending your answer to Google Gemini for feedback.",
                )
            if len(answer_text) > 8_000:
                raise HTTPException(status_code=413, detail="Interview answers must be 8,000 characters or fewer.")
            _enforce_provider_limit(user["id"], "gemini")
            try:
                feedback = analyze_interview_answer(
                    question["prompt"],
                    question["category"],
                    answer_text,
                    payload.language,
                )
            except InterviewProviderError as error:
                raise HTTPException(status_code=error.status_code, detail=error.message) from error
            score = feedback["overall_score"]
            completed = 1
        else:
            raise HTTPException(status_code=422, detail="This question type is not supported.")

        completed_at = datetime.now(timezone.utc).isoformat()
        cursor = connection.execute(
            """
            INSERT INTO practice_attempts (
                user_id, question_id, selected_answer, answer_text, score,
                completed, feedback_json, completed_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                question["id"],
                selected_answer,
                answer_text,
                score,
                completed,
                json.dumps(feedback),
                completed_at,
            ),
        )
        attempts = _attempt_count(connection, user["id"], kind, question["category"])
    return {
        "id": cursor.lastrowid,
        "question_id": question["id"],
        "kind": kind,
        "category": question["category"],
        "score": score,
        "attempts": attempts,
        "feedback": feedback,
        "completed_at": completed_at,
    }


def _score_for(connection, user_id: int, kind: str, categories: tuple[str, ...] | None = None):
    category_clause = ""
    parameters: list = [user_id, kind]
    if categories:
        placeholders = ",".join("?" for _ in categories)
        category_clause = f" AND q.category IN ({placeholders})"
        parameters.extend(categories)
    rows = connection.execute(
        f"""
        SELECT a.score FROM practice_attempts a
        JOIN practice_questions q ON q.id = a.question_id
        WHERE a.user_id = ? AND q.kind = ? AND a.completed = 1
          AND a.score IS NOT NULL {category_clause}
        """,
        parameters,
    ).fetchall()
    return {
        "score": round(mean(row["score"] for row in rows)) if rows else 0,
        "attempts": len(rows),
    }


@router.get("/progress")
def get_progress(user: CurrentUser):
    with db_session() as connection:
        coding_counts = connection.execute(
            """
            SELECT q.category AS difficulty, COUNT(DISTINCT q.id) AS total,
                COUNT(DISTINCT CASE WHEN a.completed = 1 THEN q.id END) AS completed
            FROM practice_questions q
            LEFT JOIN practice_attempts a
                ON a.question_id = q.id AND a.user_id = ?
            WHERE q.kind = 'coding'
            GROUP BY q.category
            """,
            (user["id"],),
        ).fetchall()
        aptitude_rows = connection.execute(
            """
            SELECT q.category, COUNT(DISTINCT q.id) AS total,
                COUNT(a.id) AS attempts,
                COUNT(DISTINCT CASE WHEN a.completed = 1 THEN q.id END) AS completed,
                AVG(a.score) AS average_score
            FROM practice_questions q
            LEFT JOIN practice_attempts a
                ON a.question_id = q.id AND a.user_id = ? AND a.completed = 1
            WHERE q.kind = 'aptitude'
            GROUP BY q.category ORDER BY q.category
            """,
            (user["id"],),
        ).fetchall()
        interview_rows = connection.execute(
            """
            SELECT q.category, COUNT(DISTINCT q.id) AS total,
                COUNT(a.id) AS attempts,
                COUNT(DISTINCT CASE WHEN a.completed = 1 THEN q.id END) AS completed
            FROM practice_questions q
            LEFT JOIN practice_attempts a
                ON a.question_id = q.id AND a.user_id = ? AND a.completed = 1
            WHERE q.kind = 'interview'
            GROUP BY q.category ORDER BY q.category
            """,
            (user["id"],),
        ).fetchall()
        aptitude = _score_for(connection, user["id"], "aptitude")
        technical = _score_for(connection, user["id"], "interview", tuple(TECHNICAL_CATEGORIES))
        communication = _score_for(connection, user["id"], "interview")
        problem_solving = _score_for(
            connection,
            user["id"],
            "aptitude",
            ("Logical Reasoning", "Data Interpretation"),
        )
        recent_activity = connection.execute(
            """
            SELECT q.kind, q.category, a.score, a.completed_at
            FROM practice_attempts a JOIN practice_questions q ON q.id = a.question_id
            WHERE a.user_id = ? AND a.completed = 1
            ORDER BY a.completed_at DESC, a.id DESC LIMIT 5
            """,
            (user["id"],),
        ).fetchall()

    return {
        "coding": {
            "by_difficulty": {
                row["difficulty"]: {"available": row["total"], "completed": row["completed"]}
                for row in coding_counts
            },
            "available": sum(row["total"] for row in coding_counts),
            "completed": sum(row["completed"] for row in coding_counts),
        },
        "aptitude": [
            {
                "category": row["category"],
                "available": row["total"],
                "attempts": row["attempts"],
                "completed": row["completed"],
                "average_score": round(row["average_score"]) if row["average_score"] is not None else 0,
            }
            for row in aptitude_rows
        ],
        "interview": [
            {
                "category": row["category"],
                "available": row["total"],
                "attempts": row["attempts"],
                "completed": row["completed"],
            }
            for row in interview_rows
        ],
        "skills": [
            {"label": "Programming", **technical},
            {"label": "Aptitude", **aptitude},
            {"label": "Communication", **communication},
            {"label": "Problem Solving", **problem_solving},
        ],
        "recent_activity": [
            {
                "kind": row["kind"],
                "category": row["category"],
                "score": row["score"],
                "completed_at": row["completed_at"],
            }
            for row in recent_activity
        ],
    }
