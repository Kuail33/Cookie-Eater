import os
import json
import re
from typing import Any, Dict, List, Optional
import google.generativeai as genai


def _ensure_genai_configured():
    if not getattr(genai, "_configured", False):
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            raise RuntimeError("GEMINI_API_KEY is missing in environment")
        genai.configure(api_key=api_key)
        setattr(genai, "_configured", True)

def _extract_json(text: str) -> Dict[str, Any]:
    raw = text.strip()
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError("Model did not return valid JSON.")
    return json.loads(match.group(0), strict=False)

_LANG_LABEL = {
    "japanese": "Japanese",
    "chinese": "Chinese (Simplified)",
    "korean": "Korean",
}

def translate_audit_fields(
    *,
    language: str,
    doc_type: Optional[str],
    brief_summary: str,
    advice: str,
    flags: List[str],
) -> Dict[str, Any]:
    """
    Translate already-summarized audit fields into the target language.

    Returns:
      {
        "doc_type": str|null,
        "brief_summary": str,
        "advice": str,
        "flags": [str]
      }
    """
    if language not in _LANG_LABEL:
        raise ValueError("language must be one of: japanese, chinese, korean")

    _ensure_genai_configured()

    model = genai.GenerativeModel(
        model_name="gemini-2.5-flash",
        generation_config={"response_mime_type": "application/json"},
        system_instruction=f"""
You are a professional translator.

Translate the given audit result into {_LANG_LABEL[language]}.

OUTPUT MUST BE VALID JSON with EXACT keys:
{{
  "doc_type": "string|null",
  "brief_summary": "string",
  "advice": "string",
  "flags": ["string"]
}}

RULES:
- Translate faithfully, keep tone similar (witty but clear).
- Keep flags short bullet-like strings.
- If doc_type is null, output null.
- No extra keys. No markdown. No commentary.
""",
    )

    payload = {
        "doc_type": doc_type,
        "brief_summary": brief_summary,
        "advice": advice,
        "flags": flags,
    }

    resp = model.generate_content(
        "Translate this JSON audit result:\n" + json.dumps(payload, ensure_ascii=False)
    )

    data = _extract_json(resp.text)

    # minimal validation
    for k in ["doc_type", "brief_summary", "advice", "flags"]:
        if k not in data:
            raise ValueError(f"Missing key: {k}")

    if not isinstance(data["flags"], list):
        data["flags"] = []

    return data