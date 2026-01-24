import "./App.css";
import { useEffect, useState } from "react";
import { formatSummary } from "./Format";

export default function App() {
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [language, setLanguage] = useState("english");
  const [currentLang, setCurrentLang] = useState("english"); // language of displayed summary

  const trimmed = summary.trim();
  const hasSummary = trimmed.length > 0;
  const isJsonAudit = trimmed.startsWith("{") && trimmed.endsWith("}");

  // Disable summarize once a summary exists (or while busy)
  const summarizeDisabled = loading || translating || hasSummary;

  // Disable translate if not JSON, busy, same language, or English
  const canTranslate =
    isJsonAudit &&
    !translating &&
    language !== currentLang;

  function handleSummarize(): void {
    if (summarizeDisabled) return;
    setLoading(true);
    chrome.runtime.sendMessage({ type: "SUMMARIZE_NOW" });
  }

  function handleTranslate(): void {
    if (!canTranslate) return;
    setTranslating(true);
    chrome.runtime.sendMessage({ type: "TRANSLATE", language }, (resp) => {
      if (resp?.ok === false) setTranslating(false);
    });
  }

  useEffect(() => {
  // Initial load
  chrome.storage.local.get(
    ["summary", "translatedLanguage"],
    (data: { summary?: string; translatedLanguage?: string }) => {
      if (typeof data.summary === "string") setSummary(data.summary);
      if (typeof data.translatedLanguage === "string") {
        setCurrentLang(data.translatedLanguage);
        setLanguage(data.translatedLanguage); 
      }
      setLoading(false);
    }
  );

  // Listen for storage updates
  function listener(
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
  ) {
    if (areaName !== "local") return;

    if (changes.summary?.newValue && typeof changes.summary.newValue === "string") {
      setSummary(changes.summary.newValue);
      setLoading(false);
      setTranslating(false);
    }

    if (
      changes.translatedLanguage?.newValue &&
      typeof changes.translatedLanguage.newValue === "string"
    ) {
      const newLang = changes.translatedLanguage.newValue;
      setCurrentLang(newLang);
      setLanguage(newLang); // ✅ Sync dropdown to match
    }
  }

  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}, []);

  return (
    <div className="w-[500px] min-h-[350px] max-h-[600px] flex flex-col items-center text-black overflow-hidden">
      <div className="w-full h-[80px] flex justify-center items-center gap-3 bg-[#898788]">
        <button
          onClick={handleSummarize}
          disabled={summarizeDisabled}
          className={`base-button ${summarizeDisabled ? "disabled" : ""}`}
        >
          {loading ? "Summarizing..." : hasSummary ? "Summarized" : "Summarize"}
        </button>

        {hasSummary && (
          <section className="translate-group">
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="translate-select"
              disabled={loading || translating}
            >
              <option value="english">English</option>
              <option value="spanish">Spanish</option>
              <option value="chinese">Chinese</option>
              <option value="japanese">Japanese</option>
              <option value="korean">Korean</option>
              <option value="vietnamese">Vietnamese</option>
            </select>

            <button
              onClick={handleTranslate}
              disabled={!canTranslate}
              className={`translate-button ${!canTranslate ? "disabled" : ""}`}
              title={!isJsonAudit ? "Summarize first (needs a JSON audit result)." : ""}
            >
              {translating ? "Translating..." : "Translate"}
            </button>
          </section>
        )}
      </div>

      <div className="mt-4 text-sm text-left px-4 overflow-y-auto flex-1">
        {hasSummary ? formatSummary(summary) : "No summary yet"}
      </div>
    </div>
  );
}