import os
import json
import re
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from translator import translate_audit_fields
from pydantic import BaseModel
import google.generativeai as genai
from dotenv import load_dotenv

load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

app = FastAPI()

# CORS is still required for the Chrome Extension
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_methods=["*"],
    allow_headers=["*"],
)

class AuditRequest(BaseModel):
    text: str
    language: str  # "japanese" | "chinese" | "korean"

@app.post("/analyze")
async def analyze_universal(request: AuditRequest):
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
        """
    )
    
    response = model.generate_content(f"Audit this: {request.text}")
    
    raw_output = response.text.strip()
    match = re.search(r'\{.*\}', raw_output, re.DOTALL)
    
    if not match:
        return {"error": "Analysis failed"}

    data = json.loads(match.group(0), strict=False)

    translated = translate_audit_fields(
        language=request.language,
        doc_type=data.get("doc_type"),
        brief_summary=data.get("brief_summary", ""),
        advice=data.get("advice", ""),
        flags=data.get("flags", []),
    )

    return {
        **translated,
        "safety_score": data.get("safety_score"),
    }