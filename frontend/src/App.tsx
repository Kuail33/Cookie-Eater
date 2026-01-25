import "./App.css";
import { useEffect, useState } from "react";
import { formatSummary } from "./Format";

export default function App() {
  function isValidJsonObject(text: string): boolean {
  try {
    const obj = JSON.parse(text);
    return obj && typeof obj === "object" && !Array.isArray(obj);
  } catch {
    return false;
  }
}
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [summarizePulse, setSummarizePulse] = useState<boolean>(false)
  const [translating, setTranslating] = useState<boolean>(false);
  const [language, setLanguage] = useState<string>("english");
  const [currentLang, setCurrentLang] = useState<string>("english"); // language of displayed summary

  const trimmed = summary.trim();
  const hasSummary = trimmed.length > 0;
  const isJsonAudit = isValidJsonObject(trimmed);

  const summarizeDisabled = translating || isJsonAudit;

  const canTranslate = isJsonAudit && 
  !translating && language !== currentLang 
  && language !== "english";

  function handleSummarize(): void {
  if (summarizeDisabled) return;

  setSummarizePulse(true);
  window.setTimeout(function () {
    setSummarizePulse(false);
  }, 600);

  // don’t keep button stuck 
  chrome.runtime.sendMessage({ type: "SUMMARIZE_NOW" });
}


  function handleTranslate(): void {
    if (!canTranslate) return;
    setTranslating(true);
    chrome.runtime.sendMessage({ type: "TRANSLATE", language: language }, 
      function(response) {
      if (response && response.ok === false) {setTranslating(false)}
    });
  }

  useEffect(() => {

  function listener(
  changes: Record<string, chrome.storage.StorageChange>,
  areaName: string
) {
  if (areaName !== "local") return;

  let summaryValue: string | undefined;

  if (changes.summary && typeof changes.summary.newValue === "string") {
    summaryValue = changes.summary.newValue;
  }

  // Only run this if we actually got a summary
  if (summaryValue !== undefined) {
    setSummary(summaryValue);

    const lower = summaryValue.toLowerCase();
    const stillWorking =
      lower.includes("scanning") ||
      lower.includes("fetching") ||
      lower.includes("summariz") ||
      lower.includes("analyz");

      setLoading(stillWorking);
      setTranslating(false);
    }

    if (
      changes.translatedLanguage?.newValue &&
      typeof changes.translatedLanguage.newValue === "string"
    ) {
      const newLang = changes.translatedLanguage.newValue;
      setCurrentLang(newLang);
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
          
          className={`base-button ${summarizeDisabled ? "disabled" : ""} ${summarizePulse ? "pressed" : ""}`}

        >
          {summarizePulse ? "Summarizing..." : "Summarize"}
        </button>

        <section className="translate-group">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="translate-select"
            disabled={loading || translating}
          >
            <option value="english"> English </option>
            <option value="spanish"> Spanish </option>
            <option value="chinese"> Chinese </option>
            <option value="japanese"> Japanese </option>
            <option value="korean"> Korean </option>
            
            
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
      </div>

      <div className="mt-4 text-sm text-left px-4 overflow-y-auto flex-1">
        {hasSummary ? formatSummary(summary) : "No summary yet"}
      </div>
    </div>
  );
}
