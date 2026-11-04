import json
import os
import unittest
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import patch
from urllib.parse import parse_qs, urlparse

os.environ.setdefault("CAREERFORGE_SECRET_KEY", "backend-provider-test-secret-key-at-least-32-characters")

from backend import ai_interview, ai_resume, gemini, jobs_feed
from backend.gemini import GeminiProviderError
from backend.routers import profile as profile_router


def _response(value):
    return BytesIO(json.dumps(value).encode("utf-8"))


class ProviderAdapterTests(unittest.TestCase):
    def test_adzuna_uses_indian_city_radius_and_maps_listing_fields(self):
        payload = {
            "results": [{
                "id": 12345,
                "title": "Machine Learning Engineer",
                "company": {"display_name": "Example AI"},
                "location": {"display_name": "Bengaluru, Karnataka"},
                "redirect_url": "https://www.adzuna.in/details/12345",
                "created": "2026-11-03T10:00:00Z",
                "description": "<p>Use Python and machine learning.</p>",
                "salary_min": 1_000_000,
                "salary_max": 1_500_000,
                "contract_time": "full_time",
                "contract_type": "permanent",
            }]
        }
        with (
            patch.object(jobs_feed, "ADZUNA_APP_ID", "test-app-id"),
            patch.object(jobs_feed, "ADZUNA_APP_KEY", "test-app-key"),
            patch("backend.jobs_feed.urllib.request.urlopen", return_value=_response(payload)) as open_url,
        ):
            jobs = jobs_feed._fetch_city_jobs("Bengaluru")

        request = open_url.call_args.args[0]
        query = parse_qs(urlparse(request.full_url).query)
        self.assertEqual(query["where"], ["Bengaluru"])
        self.assertEqual(query["distance"], ["31"])
        self.assertEqual(query["app_id"], ["test-app-id"])
        self.assertEqual(query["app_key"], ["test-app-key"])
        self.assertEqual(len(jobs), 1)
        self.assertEqual(jobs[0]["external_id"], "adzuna-12345")
        self.assertEqual(jobs[0]["location"], "Bengaluru, Karnataka")
        self.assertIn("Python", jobs[0]["skills"])
        self.assertEqual(jobs[0]["source"], "Adzuna")

    def test_gemini_request_keeps_key_in_server_side_header(self):
        feedback = {
            "relevance": 85,
            "clarity": 75,
            "specificity": 80,
            "strengths": ["Clear example"],
            "areas_to_improve": ["Explain the result."],
        }
        response = _response({
            "candidates": [{
                "content": {"parts": [{"text": json.dumps(feedback)}]}
            }]
        })
        with (
            patch.object(gemini, "GEMINI_API_KEY", "test-gemini-key"),
            patch.object(gemini, "GEMINI_MODEL", "gemini-test"),
            patch("backend.gemini.urllib.request.urlopen", return_value=response) as open_url,
        ):
            result = ai_interview.analyze_interview_answer(
                "Describe a project.",
                "HR",
                "I built a small application.",
            )

        request = open_url.call_args.args[0]
        request_headers = {key.casefold(): value for key, value in request.header_items()}
        sent_body = json.loads(request.data)
        self.assertEqual(request_headers["x-goog-api-key"], "test-gemini-key")
        self.assertNotIn("test-gemini-key", request.full_url)
        self.assertIn("I built a small application.", sent_body["contents"][0]["parts"][0]["text"])
        self.assertEqual(result["overall_score"], 80)
        self.assertIn("not a hiring decision", result["scoring_note"])

    def test_gemini_resume_analysis_extracts_and_validates_profile_fields(self):
        extracted = {
            "full_name": "Taylor Candidate",
            "email": "taylor@example.com",
            "phone": "+1 555 010 3030",
            "location": "Chennai, India",
            "headline": "Machine Learning Engineer",
            "summary": "Builds ML systems.",
            "education": "BSc Computer Science",
            "skills": ["Python", "TensorFlow"],
            "projects": ["Fraud detection"],
            "experience": ["ML Intern, 2025"],
            "certifications": ["Python Basics"],
            "languages": ["English"],
            "preferred_roles": [],
        }
        with (
            patch("backend.ai_resume.generate_json", return_value=extracted) as request_model,
        ):
            profile = ai_resume.analyze_resume("Taylor Candidate\nPython developer")

        self.assertEqual(profile["full_name"], "Taylor Candidate")
        self.assertEqual(profile["skills"], ["Python", "TensorFlow"])
        prompt = request_model.call_args.args[0]
        self.assertIn("Never guess, infer, or fabricate", prompt)
        self.assertNotIn("test-gemini-key", prompt)

    def test_unavailable_gemini_resume_analysis_falls_back_to_local_extraction(self):
        user = {
            "id": 7,
            "name": "Taylor Candidate",
            "email": "taylor@example.com",
            "profile_json": "{}",
        }
        with (
            patch.object(
                profile_router,
                "analyze_resume",
                side_effect=GeminiProviderError("Gemini is unavailable.", 503),
            ),
            patch("backend.routers.profile.extract_profile", return_value={
                "full_name": "Taylor Candidate",
                "email": "taylor@example.com",
                "skills": ["Python"],
            }),
        ):
            profile, notice = profile_router._analyze_resume_profile(user, "resume text")

        self.assertEqual(profile["skills"], ["Python"])
        self.assertIn("used local text extraction instead", notice)
        self.assertIn("Gemini is unavailable.", notice)


if __name__ == "__main__":
    unittest.main()
