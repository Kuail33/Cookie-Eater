
chrome.runtime.onMessage.addListener(function (message) {
  if (message.type === "SUMMARIZE_NOW") {
    handleSummarizeRequest();
  }

  if (message.type === "POLICY_FOUND") {
    handlePolicyFound(message.policyLink);
  }
});

//Triggered when user clicks "Summarize Policy" in the popup

function handleSummarizeRequest() {
  chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    if (!tabs || tabs.length === 0) {
      console.error("No active tab found.");
      return;
    }

    const tabId = tabs[0].id;

    if (!tabId) {
      console.error("Active tab has no id.");
      return;
    }

    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    });
  });
}

//Triggered when content script finds a policy link
function handlePolicyFound(policyLink: string) {
  if (!policyLink) {
    console.warn("No policy link found on this page.");
    chrome.storage.local.set({
      summary: "No Terms or Privacy Policy link found on this page."
    });
    return;
  }

  fetchAndSummarizePolicy(policyLink);
}


//Fetch policy HTML, extract text, send to backend
function fetchAndSummarizePolicy(policyLink: string) {
  fetch(policyLink)
    .then(function (response) {
      return response.text();
    })
    .then(function (html) {
      const text = extractTextFromHtml(html);
      return sendTextToBackend(text);
    })
    .then(function (summary) {
      chrome.storage.local.set({
        summary: summary
      });
    })
    .catch(function (error) {
      console.error("Failed to summarize policy:", error);
      chrome.storage.local.set({
        summary: "Error: Failed to summarize this site's policy."
      });
    });
}

/**
 * Very simple HTML → text cleaner
 */
function extractTextFromHtml(html: string): string {
  let text = html.replace(/<[^>]*>/g, " ");
  text = text.replace(/\s+/g, " ");
  return text.slice(0, 12000);
}

/**
 * Call Gemini backend
 */
function sendTextToBackend(text: string): Promise<string> {
  return fetch("http://localhost:3000/summarize", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: text })
  })
    .then(function (response) {
      return response.json();
    })
    .then(function (data) {
      return data.summary || "No summary returned from backend.";
    });
}
