import os
import json
import re
from typing import Optional, Any, Dict
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from translator import translate_audit_fields
from pydantic import BaseModel
from google import genai
from dotenv import load_dotenv
from fastapi import HTTPException
from fastapi.responses import JSONResponse
from google.api_core.exceptions import ResourceExhausted


load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI()
class TranslateRequest(BaseModel):
    audit: Dict[str, Any]   # the JSON from /analyze
    language: str

# CORS is still required for the Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

class AuditRequest(BaseModel):
    text: str
    language: Optional[str] = None  # "japanese" | "chinese" | "korean"

# -------------Translate url----------------
@app.post("/translate")
async def translate_only(req: TranslateRequest):
    try:
        language = (req.language or "").strip().lower()
        if not language or language == "english":
            return req.audit

        audit = req.audit or {}
        translated = translate_audit_fields(
            language=language,
            doc_type=audit.get("doc_type"),
            brief_summary=audit.get("brief_summary", ""),
            advice=audit.get("advice", ""),
            flags=audit.get("flags", []),
        )

        return {**translated, "safety_score": audit.get("safety_score")}
    
    except ResourceExhausted:
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Wait a bit or use a paid Gemini key."},
        )


# ------------analyze url-----------
@app.post("/analyze")
async def analyze_universal(request: AuditRequest):
    try:
        model = genai.GenerativeModel(
            model_name="gemini-2.5-flash",
            generation_config={"response_mime_type": "application/json"},
            system_instruction="""
You are 'PolicyPulse', a witty and expert legal auditor.

TASK:
1. Identify document type.
2. Assign a safety_score (0-100).
3. If score < 70: Identify up to 3 'Red Flags' (🚩).
4. If score >= 70: Return an empty list for flags or use ✅ 'Green Flags'.
5. Provide 'brief_summary': A witty, one-sentence vibe check.
6. Provide 'advice': Specific, actionable next steps for the user.

JSON FORMAT:
{
  "doc_type": "string",
  "safety_score": number,
  "flags": ["string"],
  "brief_summary": "string",
  "advice": "string"
}
""",
        )

        response = model.generate_content(f"Audit this: {request.text}")

        raw_output = (response.text or "").strip()
        match = re.search(r"\{.*\}", raw_output, re.DOTALL)
        if not match:
            raise HTTPException(status_code=502, detail="Model did not return JSON")

        try:
            data = json.loads(match.group(0), strict=False)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Bad JSON from model: {e}")

        language = (request.language or "").strip().lower()
        if not language or language == "english":
            return data

        try:
            translated = translate_audit_fields(
                language=language,
                doc_type=data.get("doc_type"),
                brief_summary=data.get("brief_summary", ""),
                advice=data.get("advice", ""),
                flags=data.get("flags", []),
            )
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Translation failed: {e}")

        return {**translated, "safety_score": data.get("safety_score")}
    except ResourceExhausted:
        return JSONResponse(
            status_code=429,
            content={"error": "Rate limit exceeded. Wait a bit or use a paid Gemini key."},
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))