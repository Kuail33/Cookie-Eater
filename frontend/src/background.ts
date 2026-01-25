let isRunning = false;

// ---------- helpers ----------
function canonicalizeUrl(url: string): string {
  try {
    return url.split("#")[0];
  } catch {
    return url;
  }
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
  const lower = url.toLowerCase();
  return (
    lower.includes("terms") ||
    lower.includes("privacy") ||
    lower.includes("policy") ||
    lower.includes("cookies")
  );
}

function auditKey(url: string) {
  return `audit:${url}`;
}

function translationKey(url: string, language: string) {
  return `translation:${url}:${language}`;
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] ?? null;
}

// ---------- summarize ----------
async function handleSummarizeRequest(): Promise<void> {
  if (isRunning) {
    console.log("Already running, ignoring SUMMARIZE_NOW");
    return;
  }
  isRunning = true;

  try {
    const tab = await getActiveTab();
    if (!tab?.id) throw new Error("No active tab id");

    const url = tab.url ?? "";

    if (isBlockedChromeUrl(url)) {
      await chrome.storage.local.set({
        summary: "Open a normal website tab (not a chrome:// page), then click Summarize.",
      });
      return;
    }

    if (isWebStoreUrl(url)) {
      await chrome.storage.local.set({
        summary: "Chrome blocks extensions on the Web Store. Try another site.",
      });
      return;
    }

    const cleanUrl = canonicalizeUrl(url);

    // Fast-path cache if the page URL itself is a policy
    if (isLikelyPolicyUrl(cleanUrl)) {
      const stored = await chrome.storage.local.get([auditKey(cleanUrl)]);
      const cachedAudit = stored[auditKey(cleanUrl)];
      if (cachedAudit) {
        console.log("Reusing cached policy audit for current page:", cleanUrl);
        await chrome.storage.local.set({
          summary: JSON.stringify(cachedAudit, null, 2),
          lastPolicyUrl: cleanUrl,
          lastAudit: cachedAudit,
          translatedLanguage: "english",
        });
        return;
      }
    }

    await chrome.storage.local.set({ summary: "Scanning page for policy link..." });

    // Inject content script to find policy link
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });
  } catch (err) {
    console.error("handleSummarizeRequest failed:", err);
    await chrome.storage.local.set({ summary: "Error: Could not start summarization." });
  } finally {
    // keep isRunning true only if we're awaiting POLICY_FOUND flow
    isRunning = false;
  }
}

// ---------- policy found flow ----------
async function handlePolicyFound(policyLink: string | null): Promise<void> {
  // Case 1: no policy link found
  if (!policyLink) {
    await chrome.storage.local.set({
      summary: "No TOS found. Run Summarize again when there is a TOS."
    });
    return;
  }

  try {
    const cleanLink = canonicalizeUrl(policyLink);

    // Cache check
    const cached = await chrome.storage.local.get([auditKey(cleanLink)]);
    if (cached[auditKey(cleanLink)]) {
      console.log("Reusing cached audit for policy:", cleanLink);
      await chrome.storage.local.set({
        summary: JSON.stringify(cached[auditKey(cleanLink)], null, 2),
        lastPolicyUrl: cleanLink,
        lastAudit: cached[auditKey(cleanLink)],
        translatedLanguage: "english",
      });
      return;
    }

    await chrome.storage.local.set({ summary: "Fetching policy..." });
    const summaryJson = await fetchAndSummarizePolicy(cleanLink);

    // If backend returned plain text (error / timeout), do NOT parse as JSON
    if (!summaryJson.trim().startsWith("{")) {
      await chrome.storage.local.set({
        summary: summaryJson,
      });
      return;
    }

    // Parse valid JSON
    const parsed = JSON.parse(summaryJson);

    await chrome.storage.local.set({
      summary: summaryJson,
      [auditKey(cleanLink)]: parsed,
      lastPolicyUrl: cleanLink,
      lastAudit: parsed,
      translatedLanguage: "english",
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

// ---------- translate ----------
async function handleTranslate(language: string): Promise<void> {
  const lang = (language || "").toLowerCase().trim();
  
  try {
    const stored = await chrome.storage.local.get(["lastPolicyUrl", "lastAudit"]);
    const lastPolicyUrl: string = (stored.lastPolicyUrl as string) || "";
    const lastAudit: unknown = stored.lastAudit;

    if (!lastPolicyUrl || !lastAudit) {
      await chrome.storage.local.set({
        summary: "Nothing to translate yet — click Summarize first.",
      });
      return;
    }

    // If English, restore the original audit
    if (!lang || lang === "english") {
      await chrome.storage.local.set({
        summary: JSON.stringify(lastAudit, null, 2),
        translatedLanguage: "english",
      });
      return;
    }

    const tKey = translationKey(lastPolicyUrl, lang);
    const cached = await chrome.storage.local.get([tKey]);
    if (cached[tKey]) {
      console.log("Reusing cached translation:", lastPolicyUrl, lang);
      await chrome.storage.local.set({
        summary: JSON.stringify(cached[tKey], null, 2),
        translatedLanguage: lang,
      });
      return;
    }

    await chrome.storage.local.set({ summary: "Translating..." });

    const translated = await callTranslate(lastAudit, lang);

    if (typeof translated === "string") {
      await chrome.storage.local.set({ summary: translated });
      return;
    }

    await chrome.storage.local.set({
      summary: JSON.stringify(translated, null, 2),
      translatedLanguage: lang,
      [tKey]: translated,
    });
  } catch (err) {
    console.error("handleTranslate failed:", err);
    await chrome.storage.local.set({ summary: "Error: Could not translate." });
  }
}

// ---------- fetch & analyze ----------
async function fetchAndSummarizePolicy(policyLink: string): Promise<string> {
  console.log("Fetching policy:", policyLink);

  const res = await fetch(policyLink, { credentials: "omit" });
  console.log("Policy fetch status:", res.status);

  if (!res.ok) {
    throw new Error(`Failed to fetch policy (${res.status})`);
  }

  const html = await res.text();
  const text = extractTextFromHtml(html);

  await chrome.storage.local.set({ summary: "Asking AI (this can take ~5–15s)..." });

  return await sendTextToBackend(text);
}

function extractTextFromHtml(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  let text = cleaned.replace(/<[^>]*>/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  return text.slice(0, 5000);
}

// ---------- backend calls ----------
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

    if (!res.ok) return `Backend ${res.status}:\n${raw}`;

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

async function callTranslate(audit: unknown, language: string): Promise<object | string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);

  try {
    const res = await fetch("http://localhost:8000/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ audit, language }),
      signal: controller.signal,
    });

    const raw = await res.text();

    if (!res.ok) return `Backend ${res.status}:\n${raw}`;

    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch {
    return "Timed out contacting the AI. Try again.";
  } finally {
    clearTimeout(timer);
  }
}

// ---------- message listener ----------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      if (message?.type === "SUMMARIZE_NOW") {
        await handleSummarizeRequest();
      } else if (message?.type === "POLICY_FOUND") {
        await handlePolicyFound(message.policyLink ?? null);
      } else if (message?.type === "TRANSLATE") {
        await handleTranslate(message.language);
      }
      sendResponse({ ok: true });
    } catch (err) {
      console.error("Background error:", err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true; 
});