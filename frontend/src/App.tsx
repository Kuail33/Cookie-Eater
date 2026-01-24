import "./App.css";
import { useEffect, useState } from "react";
import { formatSummary } from "./Format.tsx"

export default function App() {
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const hasSummary = summary.trim().length > 0;
  const isDisabled = loading || hasSummary;

  function handleSummarize(): void {
    if (isDisabled) return;
    setLoading(true);
    chrome.runtime.sendMessage({ type: "SUMMARIZE_NOW" });
  }

  useEffect(() => {
    chrome.storage.local.set({ summary: "" })

    chrome.storage.local.get(["summary"], (data: { summary?: string }) => {
      if (typeof data.summary === "string") {
        setSummary(data.summary);
      }
      setLoading(false);
    });

    function listener(
      changes: Record<string, chrome.storage.StorageChange>,
      areaName: string
    ) {
      if (areaName === "local" && changes.summary) {
        setSummary(typeof changes.summary.newValue === "string" ? changes.summary.newValue : "");
        setLoading(false);
      }
    }

    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  return (
    <div className="w-[500px] min-h-[350px] flex flex-col pb-[40px] items-center text-black overflow-hidden">
      <div className="w-full h-[64px] flex justify-center items-start pt-4 bg-[#898788]">
        <button
          onClick={handleSummarize}
          disabled={isDisabled}
          className={`base-button ${isDisabled ? "disabled" : ""}`}
        >
          {loading ? "Summarizing..." : hasSummary ? "Summarized" : "Summarize"}
        </button>
      </div>

      <div className="mt-4 text-sm text-center px-4">
        {summary && formatSummary(summary)}
      </div>
    </div>
  );
}
