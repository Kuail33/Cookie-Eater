import './App.css'
import { useEffect, useState } from "react";

export default function App() {
  const [summary, setSummary] = useState<string>("");
  const [loading, setLoading] = useState(false);

  function handleSummarize(): void {
    setLoading(true);
    chrome.runtime.sendMessage({ type: "SUMMARIZE_NOW" });
  }

  useEffect(function () {
    chrome.storage.local.get(["summary"], (data: { summary?: string }) => {
      if (data.summary) {
        setSummary(typeof data.summary === "string" ? data.summary : "");
        setLoading(false);
      }
    });
  }, []);

  return (
    <div
      id="pop-up"
      className="w-[500px] h-[350px] flex flex-col pb-[40px] items-center text-white"
    >
      <div
        id="header"
        className="w-full h-[64px] flex justify-center items-start pt-4 bg-[#898788]"
      >
        <button
          onClick={handleSummarize}
          className="flex justify-center items-center w-[138px] h-[38px] py-[7px] px-[26px] border-[3px] rounded-[10px] border-white/50 text-white hover:bg-white/10"
        >
          {loading ? "Summarizing..." : "Summarize"}
        </button>
      </div>

      <div className="mt-4 text-sm text-center px-4">
        {summary || "No summary yet"}
      </div>
    </div>
  );
}
