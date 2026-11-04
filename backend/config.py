import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).parent
PROJECT_ROOT = BACKEND_DIR.parent
load_dotenv(BACKEND_DIR / ".env")

SECRET_KEY = os.getenv("CAREERFORGE_SECRET_KEY", "")
if len(SECRET_KEY) < 32:
    raise RuntimeError(
        "Set CAREERFORGE_SECRET_KEY to a random secret of at least 32 characters "
        "in backend/.env or the process environment."
    )

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = 60 * 24

DATABASE_PATH = Path(os.getenv("CAREERFORGE_DB_PATH", "database/careerforge.db"))
if not DATABASE_PATH.is_absolute():
    DATABASE_PATH = PROJECT_ROOT / DATABASE_PATH

CORS_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "CAREERFORGE_CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173",
    ).split(",")
    if origin.strip()
]

ADZUNA_APP_ID = os.getenv("ADZUNA_APP_ID", "")
ADZUNA_APP_KEY = os.getenv("ADZUNA_APP_KEY", "")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
