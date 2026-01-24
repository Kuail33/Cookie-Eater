import "./App.css";
import { useEffect, useState } from "react";
import { formatSummary } from "./Format.tsx";

export default function App() {
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [translating, setTranslating] = useState<boolean>(false);
  const [language, setLanguage] = useState("english");
  
  const trimmed = summary.trim();
  const hasSummary = trimmed.length > 0;
  const summarizeDisabled = loading || translating || hasSummary;

  // Only treat JSON output as “ready to translate”
  const isJsonAudit = trimmed.startsWith("{") && trimmed.endsWith("}");
  const canTranslate = isJsonAudit && !translating && language !== "english";

  function handleSummarize(): void {
    if (loading || translating) return;
    if (summarizeDisabled) return;
    setLoading(true);
    chrome.runtime.sendMessage({ type: "SUMMARIZE_NOW" });
  }

  function handleTranslate(): void {
    if (!canTranslate) return;

    setTranslating(true);

    chrome.runtime.sendMessage(
      { type: "TRANSLATE", language },  // Only send language, NOT summary
      (response) => {
        console.log("Translate response:", response);
        if (response?.ok === false) setTranslating(false);
      }
    );
  }

  useEffect(() => {
    chrome.storage.local.get(["summary"], (data: { summary?: string }) => {
      if (typeof data.summary === "string") setSummary(data.summary);
      setLoading(false);
      setTranslating(false);
    });

    function listener(
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) {
      if (areaName !== "local" || !changes.summary) return;

      const next = changes.summary.newValue;
      if (typeof next !== "string") return;

      setSummary(next);

      // If summary changed, we’re done with whatever was running
      setLoading(false);
      setTranslating(false);
    }

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return (
    <div className="w-[500px] min-h-[350px] flex flex-col pb-[40px] items-center text-black overflow-hidden">
      <div className="gap-3 w-full h-[64px] flex justify-center items-start pt-4 bg-[#898788]">
        <button
          onClick={handleSummarize}
          disabled={summarizeDisabled}
          className={`base-button ${summarizeDisabled ? "disabled" : ""}`}
        >
          {loading ? "Summarizing..." : hasSummary ? "Summarized" : "Summarize"}
        </button>

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
            <option value="Vietnamese">Vietnamese</option>
          </select>

          <button
            onClick={handleTranslate}
            disabled={!canTranslate}
            className={`translate-button ${!canTranslate ? "disabled" : ""}`}
            title={!isJsonAudit ? "Summarize first (needs a JSON audit result)." : ""}
          >
            {translating ? "..." : "Translate"}
          </button>
        </section>
      </div>

      <div className="mt-4 text-sm text-center px-4">
        {hasSummary ? formatSummary(summary) : "No summary yet"}
      </div>
    </div>
  );
}
