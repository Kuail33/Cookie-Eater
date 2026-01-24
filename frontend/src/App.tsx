
import './App.css'

import { useEffect, useState } from "react";

export default function App() {
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const handleSummarize = () => {
    setLoading(true);
    chrome.runtime.sendMessage({ type: "SUMMARIZE_NOW" });
  };

  useEffect(() => {
    chrome.storage.local.get(["summary"], (data: { summary?: string }) => {
      if (data.summary) {
        setSummary(typeof data.summary === "string" ? data.summary : "");
        setLoading(false);
      }
    });
  }, []);

  return (
    <div className="w-80 p-4 text-gray-900 bg-white">
      <h1 className="text-lg font-bold mb-3"> Cookie Eater </h1>

      <button
        onClick={handleSummarize}
        className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition"
      >
        {loading ? "Summarizing..." : "Summarize Policy"}
      </button>

      <div className="mt-4 text-sm whitespace-pre-wrap">
        {summary || "No summary yet."}
      </div>

    </div>
  );
}
