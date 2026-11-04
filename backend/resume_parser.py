import re
import zipfile
from io import BytesIO
from pathlib import PurePosixPath

from docx import Document
from pypdf import PdfReader

PROFILE_FIELDS = (
    "full_name",
    "email",
    "phone",
    "location",
    "headline",
    "education",
    "skills",
    "projects",
    "experience",
    "certifications",
)

KNOWN_SKILLS = (
    "Python", "Java", "JavaScript", "TypeScript", "C++", "C#", "C",
    "React", "Angular", "Vue", "Node.js", "HTML", "CSS", "SQL",
    "PostgreSQL", "MySQL", "MongoDB", "FastAPI", "Django", "Flask",
    "Spring Boot", "AWS", "Azure", "Docker", "Kubernetes", "Git",
    "Machine Learning", "Deep Learning", "TensorFlow", "PyTorch",
    "Data Analysis", "Pandas", "NumPy", "Tableau", "Power BI",
    "Communication", "Leadership", "Project Management",
    "Generative AI", "RAG", "LangChain", "FAISS", "Scikit-learn",
    "Gemini", "EasyOCR", "Streamlit", "SQLite", "REST APIs",
)

SECTION_NAMES = {
    "education": ("education", "academic background", "academic qualifications"),
    "experience": (
        "experience",
        "work experience",
        "professional experience",
        "work history",
        "employment history",
        "internship",
        "internships",
    ),
    "projects": ("projects", "project experience"),
    "certifications": ("certifications", "certificates", "licenses"),
    "skills": ("skills", "technical skills", "core competencies", "technologies"),
    "languages": ("languages", "language proficiency"),
    "summary": (
        "summary",
        "professional summary",
        "professional headline",
        "profile",
        "objective",
        "about me",
    ),
}


def extract_text(filename: str, file_bytes: bytes) -> str:
    extension = PurePosixPath(filename.replace("\\", "/")).suffix.lower()
    if extension == ".pdf":
        reader = PdfReader(BytesIO(file_bytes))
        if reader.is_encrypted:
            raise ValueError("This PDF is password-protected. Upload an unlocked copy.")
        text = "\n".join(page.extract_text() or "" for page in reader.pages)
    elif extension == ".docx":
        with zipfile.ZipFile(BytesIO(file_bytes)) as archive:
            if "word/document.xml" not in archive.namelist():
                raise ValueError("This file is not a valid Word document.")
        document = Document(BytesIO(file_bytes))
        parts = [paragraph.text for paragraph in document.paragraphs]
        for table in document.tables:
            for row in table.rows:
                parts.append(" | ".join(cell.text for cell in row.cells))
        text = "\n".join(parts)
    else:
        raise ValueError("Upload a PDF or DOCX resume.")

    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"(\d),\s+(\d{3}\b)", r"\1,\2", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        raise ValueError(
            "No selectable text was found. For scanned PDFs, upload a text-based PDF or DOCX."
        )
    return text[:100_000]


def _heading_pattern(name: str) -> re.Pattern:
    words = name.split()
    body = r"[\s.*_:\-]*".join(
        r"[\s.*_:\-]*".join(re.escape(character) for character in word)
        for word in words
    )
    return re.compile(rf"(?<![a-z]){body}(?![a-z])", re.I)


def _section_matches(text: str) -> list[tuple[int, int, str]]:
    matches = []
    for section, aliases in SECTION_NAMES.items():
        for alias in aliases:
            for match in _heading_pattern(alias).finditer(text):
                line_start = text.rfind("\n", 0, match.start()) + 1
                prefix = text[line_start:match.start()].strip(" \t|•*#_:-")
                heading_letters = re.sub(r"[^a-z]", "", match.group(0))
                is_uppercase_heading = bool(heading_letters) and heading_letters.isupper()
                if prefix and not is_uppercase_heading:
                    continue
                matches.append((match.start(), match.end(), section))
    matches.sort(key=lambda item: (item[0], -(item[1] - item[0])))

    non_overlapping = []
    for match in matches:
        if non_overlapping and match[0] < non_overlapping[-1][1]:
            continue
        non_overlapping.append(match)
    return non_overlapping


def _section_text(text: str, section: str, matches: list[tuple[int, int, str]]) -> str:
    for index, (_, heading_end, found_section) in enumerate(matches):
        if found_section != section:
            continue
        end = matches[index + 1][0] if index + 1 < len(matches) else len(text)
        value = text[heading_end:end]
        value = re.sub(r"^[\s:|,;*#\-_]+", "", value)
        return re.sub(r"[\s|,;*#\-_]+$", "", value).strip()
    return ""


def _as_entries(value: str, limit: int = 20) -> list[str]:
    entries = re.split(
        r"\s*[|•]\s*|\s*;\s*|,\s+(?!\d{3}\b)(?![^()]*\))",
        value,
    )
    return [entry.strip(" -\t") for entry in entries if entry.strip(" -\t")][:limit]


def _extract_phone(text: str, email_match: re.Match | None) -> str:
    if email_match:
        local_part = email_match.group(0).split("@", 1)[0]
        attached_email_prefix = re.match(r"(\d{10})(?=[a-z])", local_part, re.I)
        if attached_email_prefix:
            return attached_email_prefix.group(1)
        before_email = text[:email_match.start()]
        attached_number = re.search(r"(?<!\d)(\+?\d[\d\s().-]{6,}\d)\s*$", before_email)
        if attached_number:
            digits = re.sub(r"\D", "", attached_number.group(1))
            if 7 <= len(digits) <= 15:
                return attached_number.group(1).strip()

    for match in re.finditer(r"(?<!\w)\+?\d[\d\s().-]{6,}\d(?!\w)", text):
        digits = re.sub(r"\D", "", match.group(0))
        if 7 <= len(digits) <= 15:
            return match.group(0).strip()
    return ""


def _extract_name(text: str, account_name: str, email_match: re.Match | None) -> str:
    before_contact = text[:email_match.start()] if email_match else text
    for raw_line in before_contact.splitlines()[:12]:
        line = raw_line.strip()
        line = re.sub(r"^(?:full\s+)?name\s*[:|, -]*", "", line, flags=re.I)
        line = re.sub(r"^ame\s+", "", line, flags=re.I)
        candidate = re.sub(r"\s+", " ", line).strip(" :|,-")
        if (
            2 <= len(candidate) <= 80
            and candidate.lower() not in {"name", "ame", "email", "phone", "location"}
            and re.search(r"[A-Za-z]", candidate)
            and not re.search(r"@|https?://|resume|curriculum vitae", candidate, re.I)
            and not re.search(r"\d{3}", candidate)
            and len(candidate.split()) <= 7
        ):
            account_words = {
                word.casefold()
                for word in re.findall(r"[A-Za-z]+", account_name)
            }
            words = candidate.split()
            normalized_words = []
            index = 0
            while index < len(words):
                if (
                    index + 1 < len(words)
                    and f"{words[index]}{words[index + 1]}".casefold() in account_words
                ):
                    normalized_words.append(f"{words[index]}{words[index + 1]}")
                    index += 2
                else:
                    normalized_words.append(words[index])
                    index += 1
            candidate = " ".join(normalized_words)
            return candidate

    candidate = re.sub(r"\s+", " ", account_name).strip()
    return candidate


def _flexible_term_pattern(term: str) -> str:
    words = term.split()
    return r"[\s]*".join(
        r"[\s]*".join(re.escape(character) for character in word)
        for word in words
    )


def extract_profile(text: str, account_name: str, account_email: str) -> dict:
    text = re.sub(r"\*{1,2}|_{1,2}", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"(\d),\s+(\d{3}\b)", r"\1,\2", text)
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    email_match = re.search(r"\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b", text, re.I)
    phone = _extract_phone(text, email_match)
    name = _extract_name(text, account_name, email_match)
    section_matches = _section_matches(text)
    education = _section_text(text, "education", section_matches)
    experience = _section_text(text, "experience", section_matches)
    projects = _section_text(text, "projects", section_matches)
    certifications = _section_text(text, "certifications", section_matches)
    languages = _section_text(text, "languages", section_matches)
    summary = _section_text(text, "summary", section_matches)
    detected_skills = [
        skill for skill in KNOWN_SKILLS
        if re.search(
            rf"(?<![\w.+#]){_flexible_term_pattern(skill)}(?![\w+#])",
            text,
            re.I,
        )
    ]

    location_match = next(
        (
            match.group(0)
            for match in re.finditer(
                r"\b(remote|bengaluru|bangalore|hyderabad|chennai|pune|mumbai|delhi|noida)\b",
                "\n".join(lines[:12]),
                re.I,
            )
        ),
        "",
    )
    if not location_match:
        city_match = re.search(
            r"\b(remote|bengaluru|bangalore|hyderabad|chennai|pune|mumbai|delhi|noida)\b",
            text,
            re.I,
        )
        location_match = city_match.group(0) if city_match else ""

    preamble_end = section_matches[0][0] if section_matches else len(text)
    preamble = text[:preamble_end]
    if email_match:
        preamble = preamble.replace(email_match.group(0), " ")
    if phone:
        preamble = preamble.replace(phone, " ")
    preamble = preamble.replace(name, " ")
    preamble = re.sub(r"(?im)^\s*(?:email|phone|location|name)\s*[:|]?\s*", "", preamble)
    headline = summary or re.sub(r"\s+", " ", preamble).strip(" \n\t:|,*-")

    return {
        "full_name": name[:100],
        "email": email_match.group(0) if email_match else account_email,
        "phone": phone,
        "location": location_match[:120],
        "headline": headline[:200],
        "education": education[:1000],
        "skills": detected_skills,
        "projects": _as_entries(projects, 30),
        "experience": _as_entries(experience, 30),
        "certifications": _as_entries(certifications, 30),
        "languages": _as_entries(languages, 20),
        "preferred_roles": [],
    }


def profile_completion(profile: dict, has_resume: bool) -> int:
    if not has_resume:
        return 0
    completed = sum(bool(profile.get(field)) for field in PROFILE_FIELDS)
    return round(completed / len(PROFILE_FIELDS) * 100)


def section_coverage_score(profile: dict) -> int:
    if not profile:
        return 0
    sections = ("education", "skills", "experience", "projects", "certifications", "headline")
    return round(sum(bool(profile.get(section)) for section in sections) / len(sections) * 100)
