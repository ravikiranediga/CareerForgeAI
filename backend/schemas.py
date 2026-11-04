from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class RegisterPayload(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginPayload(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ApplicationPayload(BaseModel):
    job_id: int = Field(gt=0)
    resume_id: int = Field(gt=0)
    confirmed_external_sharing: bool = False


class ApplicationStatusPayload(BaseModel):
    status: Literal["Ready to apply", "Applied", "Screening", "Assessment", "Interview", "Offer", "Rejected"]


class ProfileUpdatePayload(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=40)
    location: str | None = Field(default=None, max_length=120)
    headline: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=3000)
    education: str | None = Field(default=None, max_length=1000)
    skills: list[str] | None = Field(default=None, max_length=50)
    projects: list[str] | None = Field(default=None, max_length=30)
    experience: list[str] | None = Field(default=None, max_length=30)
    certifications: list[str] | None = Field(default=None, max_length=30)
    languages: list[str] | None = Field(default=None, max_length=30)
    preferred_roles: list[str] | None = Field(default=None, max_length=20)


class PracticeAttemptPayload(BaseModel):
    question_id: int = Field(gt=0)
    selected_answer: str = Field(default="", max_length=20)
    answer_text: str = Field(default="", max_length=20_000)
    language: str = Field(default="", max_length=40)
    ai_consent: bool = False


class ResumeAnalysisConsentPayload(BaseModel):
    gemini_consent: bool = False
