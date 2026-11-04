CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    profile_json TEXT NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL,
    work_mode TEXT NOT NULL,
    experience TEXT NOT NULL,
    salary TEXT NOT NULL,
    skills TEXT NOT NULL,
    posted TEXT NOT NULL,
    job_type TEXT NOT NULL,
    color TEXT NOT NULL,
    description TEXT NOT NULL,
    responsibilities TEXT NOT NULL,
    requirements TEXT NOT NULL,
    benefits TEXT NOT NULL,
    company_info TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'legacy',
    external_id TEXT UNIQUE,
    job_url TEXT NOT NULL DEFAULT '',
    listed_at TEXT NOT NULL DEFAULT '',
    synced_at TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id INTEGER NOT NULL REFERENCES jobs(id),
    resume_id INTEGER REFERENCES resumes(id),
    resume_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'Applied',
    applied_at TEXT NOT NULL,
    sharing_confirmed_at TEXT,
    UNIQUE(user_id, job_id)
);

CREATE TABLE IF NOT EXISTS saved_jobs (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    job_id INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    saved_at TEXT NOT NULL,
    PRIMARY KEY (user_id, job_id)
);

CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    original_name TEXT NOT NULL,
    storage_key TEXT NOT NULL UNIQUE,
    extracted_text TEXT NOT NULL,
    ats_score INTEGER NOT NULL,
    uploaded_at TEXT NOT NULL,
    is_current INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS practice_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    prompt TEXT NOT NULL,
    difficulty TEXT NOT NULL,
    topic TEXT NOT NULL,
    time_minutes INTEGER NOT NULL,
    choices_json TEXT,
    correct_answer TEXT,
    explanation TEXT,
    company_tags TEXT NOT NULL DEFAULT '',
    sample_input TEXT,
    sample_output TEXT,
    constraints_text TEXT,
    hint TEXT
);

CREATE TABLE IF NOT EXISTS practice_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    question_id INTEGER NOT NULL REFERENCES practice_questions(id) ON DELETE CASCADE,
    selected_answer TEXT NOT NULL DEFAULT '',
    answer_text TEXT NOT NULL DEFAULT '',
    score INTEGER,
    completed INTEGER NOT NULL DEFAULT 0,
    feedback_json TEXT NOT NULL DEFAULT '{}',
    completed_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_user_question
    ON practice_attempts(user_id, question_id, completed_at);

CREATE UNIQUE INDEX IF NOT EXISTS idx_practice_questions_kind_category_title
    ON practice_questions(kind, category, title);
