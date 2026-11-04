import hashlib
import html
import json
import logging
import re
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html.parser import HTMLParser

from .config import ADZUNA_APP_ID, ADZUNA_APP_KEY
from database.connection import db_session

logger = logging.getLogger(__name__)
FEED_URL = "https://api.adzuna.com/v1/api/jobs/in/search/1"
FEED_SOURCE = "Adzuna"
FEED_TTL_SECONDS = 6 * 60 * 60
MAX_JOBS = 150
MAX_COMPANIES = 30
RESULTS_PER_CITY = 50
CITY_RADIUS_KM = 50
ADZUNA_DISTANCE_MILES = int(CITY_RADIUS_KM / 1.60934)
JOB_CITIES = ("Bengaluru", "Hyderabad", "Chennai")
JOB_SEARCH_TERMS = (
    "artificial intelligence machine learning AI ML data scientist "
    "software engineer software developer Python"
)
COLORS = ("#4f46e5", "#0f766e", "#c2410c", "#0369a1", "#7c3aed", "#be123c")
ROLE_PATTERN = re.compile(
    r"\b(engineer|developer|software|data|machine learning|artificial intelligence|"
    r"ai\s*/\s*ml|aiml|ml|ai|python|backend|frontend|full.?stack|devops|cloud|security|"
    r"quality assurance|product manager|qa|test automation|analyst|scientist)\b",
    re.I,
)
AI_ROLE_PATTERN = re.compile(
    r"\b(ai\s*/\s*ml|aiml|ai engineer|ml engineer|machine learning|artificial intelligence)\b",
    re.I,
)
SKILL_TERMS = (
    "Python", "Java", "JavaScript", "TypeScript", "C++", "SQL", "React",
    "TensorFlow", "PyTorch", "scikit-learn", "FastAPI", "Django", "AWS",
    "Azure", "Docker", "Kubernetes", "Pandas", "NumPy", "Spark",
    "Machine Learning", "Deep Learning", "Generative AI", "LangChain",
)


class JobFeedError(Exception):
    pass


class _TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored_depth = 0

    def handle_starttag(self, tag, _attrs):
        if tag in {"script", "style"}:
            self.ignored_depth += 1
        elif tag in {"p", "br", "li", "div", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in {"script", "style"} and self.ignored_depth:
            self.ignored_depth -= 1
        elif tag in {"p", "li", "div", "h1", "h2", "h3"}:
            self.parts.append("\n")

    def handle_data(self, data):
        if not self.ignored_depth:
            self.parts.append(data)


def _plain_text(value: str) -> str:
    markup = html.unescape(value or "")
    parser = _TextExtractor()
    parser.feed(markup)
    return re.sub(r"\n{3,}", "\n\n", re.sub(r"[ \t]+", " ", "".join(parser.parts))).strip()


def _posted_label(created_at) -> tuple[str, str]:
    try:
        if isinstance(created_at, (int, float)):
            published = datetime.fromtimestamp(created_at, timezone.utc)
        else:
            published = datetime.fromisoformat(str(created_at).replace("Z", "+00:00"))
            if published.tzinfo is None:
                published = published.replace(tzinfo=timezone.utc)
            published = published.astimezone(timezone.utc)
    except (TypeError, ValueError, OSError, OverflowError):
        return "Date not provided", ""
    elapsed_days = max(0, (datetime.now(timezone.utc) - published).days)
    if elapsed_days == 0:
        label = "Today"
    elif elapsed_days == 1:
        label = "1 day ago"
    else:
        label = f"{elapsed_days} days ago"
    return label, published.isoformat()


def _map_job(item: dict) -> dict | None:
    company_data = item.get("company")
    company = str(company_data.get("display_name") or "").strip() if isinstance(company_data, dict) else ""
    title = str(item.get("title") or "").strip()
    external_id = str(item.get("id") or "").strip()
    job_url = str(item.get("redirect_url") or "").strip()
    if not company or not title or not external_id or not job_url.startswith("https://"):
        return None

    location_data = item.get("location")
    location = str(location_data.get("display_name") or "").strip() if isinstance(location_data, dict) else ""
    location = location or "Location not specified"
    contract_time = str(item.get("contract_time") or "").replace("_", " ").title()
    contract_type = str(item.get("contract_type") or "").replace("_", " ").title()
    job_type = ", ".join(value for value in (contract_time, contract_type) if value) or "Not specified by employer"
    description = _plain_text(str(item.get("description") or ""))
    if len(description) > 8000:
        description = description[:8000].rsplit(" ", 1)[0] + "…"
    searchable_text = f"{title} {description}"
    skills = [
        skill for skill in SKILL_TERMS
        if re.search(rf"(?<![a-z0-9+#]){re.escape(skill)}(?![a-z0-9+#])", searchable_text, re.I)
    ][:8]
    posted, listed_at = _posted_label(item.get("created"))
    digest = hashlib.sha256(company.casefold().encode("utf-8")).digest()
    color = COLORS[digest[0] % len(COLORS)]
    salary_min = item.get("salary_min")
    salary_max = item.get("salary_max")
    if isinstance(salary_min, (int, float)) and isinstance(salary_max, (int, float)):
        salary = f"₹{salary_min:,.0f}–₹{salary_max:,.0f} per year"
    elif isinstance(salary_min, (int, float)):
        salary = f"From ₹{salary_min:,.0f} per year"
    elif isinstance(salary_max, (int, float)):
        salary = f"Up to ₹{salary_max:,.0f} per year"
    else:
        salary = "Not specified by employer"

    return {
        "external_id": f"adzuna-{external_id}",
        "title": title,
        "company": company,
        "location": location,
        "work_mode": "Location-based",
        "experience": "Not specified by employer",
        "salary": salary,
        "skills": ",".join(dict.fromkeys(skills)),
        "posted": posted,
        "job_type": job_type,
        "color": color,
        "description": description or "Open the original listing for role details.",
        "responsibilities": "",
        "requirements": "",
        "benefits": "",
        "company_info": f"Live job listing via {FEED_SOURCE}. Verify details and availability with the employer.",
        "source": FEED_SOURCE,
        "job_url": job_url,
        "listed_at": listed_at,
    }


def _fetch_city_jobs(city: str) -> list[dict]:
    parameters = urllib.parse.urlencode({
        "app_id": ADZUNA_APP_ID,
        "app_key": ADZUNA_APP_KEY,
        "results_per_page": RESULTS_PER_CITY,
        "what_or": JOB_SEARCH_TERMS,
        "where": city,
        "distance": ADZUNA_DISTANCE_MILES,
        "sort_by": "date",
    })
    request = urllib.request.Request(
        f"{FEED_URL}?{parameters}",
        headers={"Accept": "application/json", "User-Agent": "CareerForge/1.0 job-listings"},
    )
    try:
        with urllib.request.urlopen(request, timeout=12) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        raise JobFeedError(f"{city}: Adzuna returned HTTP {error.code}.") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise JobFeedError(f"{city}: Adzuna could not be reached.") from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise JobFeedError(f"{city}: Adzuna returned an invalid response.") from None

    entries = payload.get("results") if isinstance(payload, dict) else None
    if not isinstance(entries, list):
        raise JobFeedError(f"{city}: Adzuna returned an invalid job-list response.")
    jobs = []
    for entry in entries:
        if not isinstance(entry, dict) or not ROLE_PATTERN.search(str(entry.get("title") or "")):
            continue
        job = _map_job(entry)
        if job is not None:
            jobs.append(job)
    return jobs


def _fetch_current_jobs() -> tuple[list[dict], str | None]:
    if not ADZUNA_APP_ID or not ADZUNA_APP_KEY:
        raise JobFeedError("Set ADZUNA_APP_ID and ADZUNA_APP_KEY in backend/.env to load live jobs.")

    jobs = []
    warnings = []
    with ThreadPoolExecutor(max_workers=len(JOB_CITIES)) as executor:
        futures = {executor.submit(_fetch_city_jobs, city): city for city in JOB_CITIES}
        for future in as_completed(futures):
            city = futures[future]
            try:
                jobs.extend(future.result())
            except JobFeedError as error:
                logger.warning("Unable to refresh the %s listings from Adzuna: %s", city, error)
                warnings.append(str(error))

    unique_jobs = list({job["external_id"]: job for job in jobs}.values())
    unique_jobs.sort(
        key=lambda job: (
            bool(AI_ROLE_PATTERN.search(job["title"])),
            job["listed_at"],
        ),
        reverse=True,
    )
    unique_jobs = unique_jobs[:MAX_JOBS]
    selected_jobs = []
    selected_companies = set()
    for job in unique_jobs:
        company = job["company"].casefold()
        if company not in selected_companies:
            if len(selected_companies) >= MAX_COMPANIES:
                continue
            selected_companies.add(company)
        selected_jobs.append(job)
    unique_jobs = selected_jobs
    if not unique_jobs:
        if warnings:
            raise JobFeedError("No current job listings could be loaded. " + " ".join(warnings))
        raise JobFeedError("Adzuna returned no current technical job listings for the selected cities.")
    warning = "Some city searches failed: " + " ".join(warnings) if warnings else None
    return unique_jobs, warning


def _refresh_is_due(connection) -> bool:
    row = connection.execute(
        """
        SELECT MAX(strftime('%s', synced_at)) AS latest_sync
        FROM jobs WHERE source = ?
        """,
        (FEED_SOURCE,),
    ).fetchone()
    if row["latest_sync"] is None:
        return True
    return datetime.now(timezone.utc).timestamp() - int(row["latest_sync"]) >= FEED_TTL_SECONDS


def refresh_job_cache() -> tuple[bool, str | None]:
    with db_session() as connection:
        if not _refresh_is_due(connection):
            return False, None

    try:
        jobs, fetch_warning = _fetch_current_jobs()
    except JobFeedError as error:
        logger.warning("Unable to refresh live job listings from %s: %s", FEED_SOURCE, error)
        with db_session() as connection:
            cached = connection.execute(
                "SELECT COUNT(*) AS count FROM jobs WHERE source = ? AND is_active = 1",
                (FEED_SOURCE,),
            ).fetchone()["count"]
        if cached:
            return True, f"Live job feed is unavailable; showing the last cached listings. {error}"
        raise RuntimeError(f"Unable to load current job listings from {FEED_SOURCE}. {error}") from error

    synced_at = datetime.now(timezone.utc).isoformat()
    with db_session() as connection:
        connection.execute(
            "UPDATE jobs SET is_active = 0 WHERE source = ?",
            (FEED_SOURCE,),
        )
        for job in jobs:
            connection.execute(
                """
                INSERT INTO jobs (
                    title, company, location, work_mode, experience, salary,
                    skills, posted, job_type, color, description, responsibilities,
                    requirements, benefits, company_info, source, external_id,
                    job_url, listed_at, synced_at, is_active
                ) VALUES (
                    :title, :company, :location, :work_mode, :experience, :salary,
                    :skills, :posted, :job_type, :color, :description, :responsibilities,
                    :requirements, :benefits, :company_info, :source, :external_id,
                    :job_url, :listed_at, :synced_at, 1
                )
                ON CONFLICT(external_id) DO UPDATE SET
                    title = excluded.title,
                    company = excluded.company,
                    location = excluded.location,
                    work_mode = excluded.work_mode,
                    experience = excluded.experience,
                    salary = excluded.salary,
                    skills = excluded.skills,
                    posted = excluded.posted,
                    job_type = excluded.job_type,
                    color = excluded.color,
                    description = excluded.description,
                    responsibilities = excluded.responsibilities,
                    requirements = excluded.requirements,
                    benefits = excluded.benefits,
                    company_info = excluded.company_info,
                    source = excluded.source,
                    job_url = excluded.job_url,
                    listed_at = excluded.listed_at,
                    synced_at = excluded.synced_at,
                    is_active = 1
                """,
                {**job, "synced_at": synced_at},
            )
    return False, fetch_warning
