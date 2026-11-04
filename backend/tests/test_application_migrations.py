import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

os.environ.setdefault("CAREERFORGE_SECRET_KEY", "backend-application-test-secret-key-at-least-32-characters")

from database import connection, initialize


class ApplicationMigrationTests(unittest.TestCase):
    def test_existing_application_table_gets_resume_reference_and_confirmation_timestamp(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "legacy.db"
            legacy_connection = sqlite3.connect(database_path)
            legacy_connection.executescript(
                """
                CREATE TABLE users (id INTEGER PRIMARY KEY);
                CREATE TABLE jobs (id INTEGER PRIMARY KEY);
                CREATE TABLE applications (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    job_id INTEGER NOT NULL REFERENCES jobs(id),
                    resume_name TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'Applied',
                    applied_at TEXT NOT NULL,
                    UNIQUE(user_id, job_id)
                );
                """
            )
            legacy_connection.close()

            with (
                patch.object(initialize, "DATABASE_PATH", database_path),
                patch.object(connection, "DATABASE_PATH", database_path),
            ):
                initialize.initialize_database()

            migrated_connection = sqlite3.connect(database_path)
            columns = {
                row[1] for row in migrated_connection.execute("PRAGMA table_info(applications)")
            }
            foreign_keys = migrated_connection.execute("PRAGMA foreign_key_list(applications)").fetchall()
            migrated_connection.close()

        self.assertIn("resume_id", columns)
        self.assertIn("sharing_confirmed_at", columns)
        self.assertTrue(any(row[2] == "resumes" and row[3] == "resume_id" for row in foreign_keys))


if __name__ == "__main__":
    unittest.main()
