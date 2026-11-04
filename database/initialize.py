from pathlib import Path

from backend.config import DATABASE_PATH
from database.connection import db_session

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def initialize_database():
    """Create database tables, migrate old files, and seed practice questions."""
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with db_session() as connection:
        connection.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        user_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(users)").fetchall()
        }
        if "profile_json" not in user_columns:
            connection.execute(
                "ALTER TABLE users ADD COLUMN profile_json TEXT NOT NULL DEFAULT '{}'"
            )
        job_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(jobs)").fetchall()
        }
        migrations = {
            "source": "TEXT NOT NULL DEFAULT 'legacy'",
            "external_id": "TEXT",
            "job_url": "TEXT NOT NULL DEFAULT ''",
            "listed_at": "TEXT NOT NULL DEFAULT ''",
            "synced_at": "TEXT NOT NULL DEFAULT ''",
            "is_active": "INTEGER NOT NULL DEFAULT 1",
        }
        for column, definition in migrations.items():
            if column not in job_columns:
                connection.execute(f"ALTER TABLE jobs ADD COLUMN {column} {definition}")
        application_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(applications)").fetchall()
        }
        application_migrations = {
            "resume_id": "INTEGER REFERENCES resumes(id)",
            "sharing_confirmed_at": "TEXT",
        }
        for column, definition in application_migrations.items():
            if column not in application_columns:
                connection.execute(f"ALTER TABLE applications ADD COLUMN {column} {definition}")
        connection.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_jobs_external_id ON jobs(external_id)"
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_jobs_live_source_active ON jobs(source, is_active, synced_at)"
        )
        question_columns = {
            row["name"] for row in connection.execute("PRAGMA table_info(practice_questions)").fetchall()
        }
        question_migrations = {
            "sample_input": "TEXT",
            "sample_output": "TEXT",
            "constraints_text": "TEXT",
            "hint": "TEXT",
        }
        for column, definition in question_migrations.items():
            if column not in question_columns:
                connection.execute(f"ALTER TABLE practice_questions ADD COLUMN {column} {definition}")
        from database.practice_seed import QUESTIONS

        connection.executemany(
            """
            INSERT INTO practice_questions (
                kind, category, title, prompt, difficulty, topic, time_minutes,
                choices_json, correct_answer, explanation, company_tags,
                sample_input, sample_output, constraints_text, hint
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(kind, category, title) DO UPDATE SET
                sample_input = excluded.sample_input,
                sample_output = excluded.sample_output,
                constraints_text = excluded.constraints_text,
                hint = excluded.hint
            """,
            [
                (
                    question["kind"],
                    question["category"],
                    question["title"],
                    question["prompt"],
                    question["difficulty"],
                    question["topic"],
                    question["time_minutes"],
                    question.get("choices_json"),
                    question.get("correct_answer"),
                    question.get("explanation"),
                    question.get("company_tags", ""),
                    question.get("sample_input"),
                    question.get("sample_output"),
                    question.get("constraints_text"),
                    question.get("hint"),
                )
                for question in QUESTIONS
            ],
        )
