import sqlite3
from contextlib import contextmanager

from backend.config import DATABASE_PATH


@contextmanager
def db_session():
    """Open a SQLite connection and commit successful operations."""
    connection = sqlite3.connect(DATABASE_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        with connection:
            yield connection
    finally:
        connection.close()
