import json
import logging
import urllib.error
import urllib.parse
import urllib.request

from .config import GEMINI_API_KEY, GEMINI_MODEL

logger = logging.getLogger(__name__)
MAX_RESPONSE_BYTES = 128_000


class GeminiProviderError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def generate_json(prompt: str, response_schema: dict, max_output_tokens: int = 1200) -> dict:
    if not GEMINI_API_KEY:
        raise GeminiProviderError(
            "Gemini is not configured. Set GEMINI_API_KEY in backend/.env.",
            503,
        )

    model = urllib.parse.quote(GEMINI_MODEL, safe="-._")
    endpoint = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    body = {
        "contents": [{"role": "user", "parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "maxOutputTokens": max_output_tokens,
            "responseMimeType": "application/json",
            "responseSchema": response_schema,
        },
    }
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-goog-api-key": GEMINI_API_KEY,
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw_response = response.read(MAX_RESPONSE_BYTES + 1)
            if len(raw_response) > MAX_RESPONSE_BYTES:
                raise GeminiProviderError("Gemini returned an oversized response.", 502)
            payload = json.loads(raw_response)
    except urllib.error.HTTPError as error:
        logger.warning("Gemini request failed with HTTP %s.", error.code)
        status_code = 503 if error.code == 429 or error.code >= 500 else 502
        raise GeminiProviderError(
            "Gemini could not process this request. Check the API key, model, quota, and try again.",
            status_code,
        ) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        logger.warning("Gemini could not be reached.")
        raise GeminiProviderError(
            "Gemini is unavailable. Check the backend connection and try again.",
            503,
        ) from None
    except (json.JSONDecodeError, UnicodeDecodeError):
        logger.warning("Gemini returned an unreadable response.")
        raise GeminiProviderError("Gemini returned an unreadable response.", 502) from None

    try:
        text = payload["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(text)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError):
        logger.warning("Gemini returned a response that did not match the requested JSON format.")
        raise GeminiProviderError("Gemini returned an invalid response. Please try again.", 502) from None
    if not isinstance(result, dict):
        raise GeminiProviderError("Gemini returned an invalid response. Please try again.", 502)
    return result
