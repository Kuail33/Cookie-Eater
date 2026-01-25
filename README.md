# CookieEater – AI-Powered Policy Auditor

-- Made by Diplomats --

A Chrome extension that audits legal documents and terms of service using Google's Gemini AI. Get instant safety scores, red flags, and actionable advice in your preferred language.

## Features

- 🔍 **Instant Policy Analysis** – Paste or upload policy text for real-time audit
- 🚩 **Safety Scoring** – 0-100 score with AI-identified red flags and green flags
- 🌐 **Multi-Language Support** – Audit results translated to Japanese, Chinese, Korean, Spanish, and more
- ⚡ **Fast Feedback** – Powered by Gemini 2.5 Flash for quick responses
- 🛡️ **Secure** – API key stored server-side; no credentials in frontend

## Tech Stack

- **Frontend:** React + TypeScript (Chrome Extension)
- **Backend:** FastAPI (Python)
- **AI:** Google Gemini 2.5 Flash
- **Build:** Vite, npm

## Prerequisites

- **Node.js** 18+ (for frontend)
- **Python** 3.10+ (for backend)
- **Google Gemini API Key** – [Get one free](https://aistudio.google.com/app/apikey)
- Chrome browser

## Why CookieEater matters?

- Encourages informed consent
- Makes legal documents accessible to non-experts
- Supports multilingual users
- Helps users avoid harmful or unfair terms
- Promotes transparency in digital agreements

## What’s next for CookieEater

- Manual text / file upload for blocked sites
- PDF support for downloaded policies
- Streaming or background AI analysis
- User risk preference settings
- Export/shareable summaries
- Accessibility improvements
- More language support

## Installation

### 1. Clone & Setup

```bash
git clone https://github.com/your-username/extension-final.git
cd extension-final
```

### 2. Backend Setup

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Create .env file
cp .env.example .env
# Edit .env and add your Gemini API key:
# GEMINI_API_KEY=your_key_here
```

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
npm install

# Build the extension
npm run build
```

## Running

### Backend

```bash
cd backend
source venv/bin/activate  # Activate virtual env
uvicorn main:app --reload --port 8000
```

The API will be available at `http://localhost:8000`

### Frontend (Chrome Extension)

1. Open Chrome and go to `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select the `frontend/dist/` folder
5. The extension is now installed and ready to use

## Usage

1. **Open a policy or Terms of Service** (or paste text anywhere on the web)
2. **Click the PolicyPulse extension icon**
3. Paste or select policy text
4. Choose your preferred language (optional)
5. Click **Analyze** to get instant audit results

Results include:

- **Document Type** – What kind of policy this is
- **Safety Score** – 0-100 rating
- **Red/Green Flags** – Key concerns or positives
- **Summary** – Witty one-liner vibe check
- **Advice** – Actionable next steps

## Environment Variables

Create a `.env` file in the `backend/` directory:

```
GEMINI_API_KEY=your_gemini_api_key_here
```

**Never commit `.env` to version control!**

## Project Structure

```
extension-final/
├── backend/
│   ├── main.py              # FastAPI app & /analyze endpoint
│   ├── translator.py        # Translation logic using Gemini
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Template for environment variables
└── frontend/
    ├── src/
    │   ├── App.tsx           # Main component
    │   ├── background.ts     # Extension background script
    │   ├── content.ts        # Page content injection
    │   └── helpers/          # Utility functions
    ├── public/manifest.json  # Extension manifest
    ├── package.json          # npm dependencies
    └── vite.config.ts        # Vite build config
```

## API Endpoints

### `POST /analyze`

Analyze a policy and return audit results.

**Request:**

```json
{
  "text": "policy text here",
  "language": "english"
}
```

**Response:**

```json
{
  "doc_type": "Terms of Service",
  "safety_score": 65,
  "flags": ["🚩 Tracking clauses", "🚩 Forced arbitration"],
  "brief_summary": "Pretty standard terms, some sketchy tracking.",
  "advice": "Consider disabling cookies and reviewing data sharing clauses."
}
```

### `POST /translate`

Translate audit results to another language.

**Request:**

```json
{
  "audit": {
    /* audit object from /analyze */
  },
  "language": "japanese"
}
```

**Response:** Translated audit object

## Troubleshooting

### Backend won't start

- Ensure `.env` exists with your Gemini API key
- Check Python version: `python --version` (must be 3.10+)
- Reinstall deps: `pip install --upgrade -r requirements.txt`

### Extension not loading in Chrome

- Verify `frontend/dist/` exists (run `npm run build` if missing)
- Hard refresh Chrome extensions page (Ctrl+Shift+Delete)
- Check Chrome console for errors (DevTools → Extensions)

### API calls fail

- Confirm backend is running on `localhost:8000`
- Check backend logs for error messages
- Verify `.env` has a valid Gemini API key

## Contributing

Contributions welcome! Please:

1. Fork the repo
2. Create a feature branch
3. Submit a pull request

## Support

- 📧 Email: 
[nlathi@fandm.edu](mailto:nlathi@fandm.edu)
[hlinhtet@fandm.edu](mailto:hlinhtet@fandm.edu)
[mkwon@fandm.edu](mailto:mkwon@fandm.edu)
- 🐛 Issues: [GitHub Issues](https://github.com/Kuail33/extension-final/issues)

---

**Made with ❤️ by Diplomats**
