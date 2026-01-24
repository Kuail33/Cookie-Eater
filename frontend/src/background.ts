let isRunning = false;

// Cache key helper (canonical URL without #fragment)
function canonicalizeUrl(url: string): string {
  return url.split("#")[0];
}

function cacheKeyForPolicy(url: string): string {
  return `policySummary:${canonicalizeUrl(url)}`;
}

function isBlockedChromeUrl(url: string): boolean {
  return url.startsWith("chrome://") || url.startsWith("chrome-extension://");
}

function isWebStoreUrl(url: string): boolean {
  return (
    url.startsWith("https://chrome.google.com/webstore") ||
    url.startsWith("https://chromewebstore.google.com")
  );
}

function isLikelyPolicyUrl(url: string): boolean {
  const u = url.toLowerCase();
  return (
    u.includes("terms") ||
    u.includes("privacy") ||
    u.includes("cookie") ||
    u.includes("policy") ||
    u.includes("tos")
  );
}

// -------- Message Listener (single listener only) --------
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      console.log("Background got message:", message, "from", sender);

      if (message?.type === "SUMMARIZE_NOW") {
        console.log("Handling summarize request...");
        await handleSummarizeRequest();
      } else if (message?.type === "POLICY_FOUND") {
        console.log("Policy found message:", message.policyLink);
        await handlePolicyFound(message.policyLink ?? null);
      }

      sendResponse({ ok: true });
    } catch (err) {
      console.error("Background error:", err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  // IMPORTANT for MV3: keep service worker alive during async work
  return true;
});

// -------- Main Flow --------

// Triggered when user clicks "Summarize" in the popup
async function handleSummarizeRequest(): Promise<void> {
  if (isRunning) {
    console.log("Already running, ignoring SUMMARIZE_NOW");
    return;
  }

  isRunning = true;

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error("No active tab id");

    const url = tab.url ?? "";

    // Block Chrome internal pages
    if (isBlockedChromeUrl(url)) {
      await chrome.storage.local.set({
        summary: "Open a normal website tab (not a chrome:// page), then click Summarize.",
      });
      isRunning = false;
      return;
    }

    // Block Chrome Web Store
    if (isWebStoreUrl(url)) {
      await chrome.storage.local.set({
        summary: "Chrome blocks extensions on the Web Store. Try another site.",
      });
      isRunning = false;
      return;
    }

    // ✅ If the user is ALREADY on a policy page, try cache immediately using the tab URL
    if (isLikelyPolicyUrl(url)) {
      const clean = canonicalizeUrl(url);
      const key = cacheKeyForPolicy(clean);
      const cached = await chrome.storage.local.get([key]);

      if (typeof cached[key] === "string" && cached[key].trim().length > 0) {
        console.log("Reusing cached policy summary for current page:", clean);
        await chrome.storage.local.set({ summary: cached[key] });
        isRunning = false;
        return;
      }
    }

    // Otherwise we need to scan the page for a policy link
    await chrome.storage.local.set({ summary: "Scanning page for policy link..." });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    // NOTE: keep isRunning=true until handlePolicyFound finishes
  } catch (err) {
    console.error("handleSummarizeRequest failed:", err);
    await chrome.storage.local.set({ summary: "Error: Could not start summarization." });
    isRunning = false;
  }
}

// Triggered when content script finds a policy link (or uses current URL)
async function handlePolicyFound(policyLink: string | null): Promise<void> {
  try {
    if (!policyLink) {
      await chrome.storage.local.set({
        summary: "No Terms / Privacy / Cookies link found on this page.",
      });
      return;
    }

    const cleanLink = canonicalizeUrl(policyLink);
    const key = cacheKeyForPolicy(cleanLink);

    const cached = await chrome.storage.local.get([key]);
    if (typeof cached[key] === "string" && cached[key].trim().length > 0) {
      console.log("Reusing cached policy summary for:", cleanLink);
      await chrome.storage.local.set({ summary: cached[key] });
      return;
    }

    await chrome.storage.local.set({ summary: "Fetching policy text..." });

    const summary = await fetchAndSummarizePolicy(cleanLink);

    // Save both: what popup displays + per-policy cache
    await chrome.storage.local.set({
      summary,
      [key]: summary,
      lastPolicyLink: cleanLink,
    });
  } catch (err) {
    console.error("handlePolicyFound failed:", err);
    await chrome.storage.local.set({
      summary: `Error: ${err instanceof Error ? err.message : String(err)}`,
    });
  } finally {
    isRunning = false;
  }
}

// Fetch policy HTML → extract text → send to backend
async function fetchAndSummarizePolicy(policyLink: string): Promise<string> {
  console.log("Fetching policy:", policyLink);

  const res = await fetch(policyLink, { credentials: "omit" });
  console.log("Policy fetch status:", res.status);

  const html = await res.text();
  const text = extractTextFromHtml(html);

  await chrome.storage.local.set({ summary: "Asking AI (this can take ~5–15s)..." });

  return await sendTextToBackend(text);
}

// Cleaner + smaller text = faster + fewer tokens
function extractTextFromHtml(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  let text = cleaned.replace(/<[^>]*>/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  // Smaller = faster. Adjust if you want.
  return text.slice(0, 5000);
}

// Call backend (robust + timeout)
async function sendTextToBackend(text: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("http://localhost:8000/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language: "english" }),
      signal: controller.signal,
    });

    const raw = await res.text();

    if (!res.ok) {
      // Keep this as a string so the popup shows the real error (429/500/etc.)
      return `Backend ${res.status}:\n${raw}`;
    }

    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  } catch {
    return "Timed out contacting the AI. Try again (or the site may be blocking requests).";
  } finally {
    clearTimeout(timer);
  }
}
