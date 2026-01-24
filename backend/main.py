import os
from fastapi import FastAPI  # pyright: ignore[reportMissingImports]
from fastapi.middleware.cors import CORSMiddleware  # pyright: ignore[reportMissingImports]
from pydantic import BaseModel  # pyright: ignore[reportMissingImports]
import google.generativeai as genai  # pyright: ignore[reportMissingImports]
from dotenv import load_dotenv  # pyright: ignore[reportMissingImports]

# 1. Load your API Key
load_dotenv()
genai.configure(api_key=os.getenv("GEMINI_API_KEY"))

# 2. Initialize FastAPI
app = FastAPI()
@app.get("/")
def read_root():
    return {"message": "LegalLens API is running! Go to /docs to test."}
# 3. CRITICAL: Enable CORS 
# This allows your friend's Chrome Extension to talk to your Python server.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In a real app, you'd specify the extension ID
    allow_methods=["*"],
    allow_headers=["*"],
)

# 4. Define what the data looks like (The "Order Form")
class LeaseRequest(BaseModel):
    text: str

# 5. The "Brain" - Talking to Gemini
@app.post("/analyze")
async def analyze_lease(request: LeaseRequest):
    model = genai.GenerativeModel(
    model_name="gemini-2.5-flash",
    system_instruction="""
    You are HoyaLegalLens, a concise D.C. Tenant Rights bot. 
    Analyze lease clauses for students. 
    Keep responses under 3 short bullet points:
    1. Status: (Legal / Illegal / Risky)
    2. Law: (Specific D.C. Code citation)
    3. Action: (One sentence of advice)
    Be witty, professional, and very brief.
    """
)
    
    prompt = f"""
    You are a tenant rights lawyer in Washington DC. 
    Analyze this lease text for 3 specific things:
    1. Illegal clauses (D.C. specific)
    2. Hidden fees
    3. Negotiation advice.
    
    Lease text: {request.text}
    """
    
    response = model.generate_content(prompt)
    return {"analysis": response.text}