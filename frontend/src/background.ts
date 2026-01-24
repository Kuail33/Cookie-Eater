let isRunning = false;

// ---------- helpers ----------
function canonicalizeUrl(url: string): string {
  return url.split("#")[0];
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
  return u.includes("terms") || u.includes("privacy") || u.includes("cookie") || u.includes("policy") || u.includes("tos");
}

function auditKey(url: string) {
  return `audit:${canonicalizeUrl(url)}`; // stores the raw audit object
}

function translationKey(url: string, language: string) {
  return `translation:${canonicalizeUrl(url)}:${language}`; // stores translated audit object
}

async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs?.[0] ?? null;
}

// ---------- message listener (ONLY ONE) ----------
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  (async () => {
    try {
      console.log("Background got message:", message);

      if (message?.type === "SUMMARIZE_NOW") {
        await handleSummarizeRequest();
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === "POLICY_FOUND") {
        await handlePolicyFound(message.policyLink ?? null);
        sendResponse({ ok: true });
        return;
      }

      if (message?.type === "TRANSLATE") {
        await handleTranslate(message.language);
        sendResponse({ ok: true });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (err) {
      console.error("Background error:", err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  // keep service worker alive for async
  return true;
});

// ---------- summarize flow ----------
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

    // If already on a policy URL, try to reuse cached audit immediately
    if (isLikelyPolicyUrl(cleanUrl)) {
      const stored = await chrome.storage.local.get([auditKey(cleanUrl)]);
      const cachedAudit = stored[auditKey(cleanUrl)];
      if (cachedAudit) {
        console.log("Reusing cached policy audit for current page:", cleanUrl);
        await chrome.storage.local.set({
          summary: JSON.stringify(cachedAudit, null, 2),
          lastPolicyUrl: cleanUrl,
          lastAudit: cachedAudit,
        });
        return;
      }
    }

    await chrome.storage.local.set({ summary: "Scanning page for policy link..." });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"],
    });

    // keep isRunning=true until POLICY_FOUND finishes
  } catch (err) {
    console.error("handleSummarizeRequest failed:", err);
    await chrome.storage.local.set({ summary: "Error: Could not start summarization." });
    isRunning = false;
  }
}

async function handlePolicyFound(policyLink: string | null): Promise<void> {
  try {
    if (!policyLink) {
      await chrome.storage.local.set({
        summary: "No Terms / Privacy / Cookies link found on this page.",
      });
      return;
    }

    const cleanLink = canonicalizeUrl(policyLink);

    // reuse cached audit if exists
    const stored = await chrome.storage.local.get([auditKey(cleanLink)]);
    const cachedAudit = stored[auditKey(cleanLink)];
    if (cachedAudit) {
      console.log("Reusing cached audit for:", cleanLink);
      await chrome.storage.local.set({
        summary: JSON.stringify(cachedAudit, null, 2),
        lastPolicyUrl: cleanLink,
        lastAudit: cachedAudit,
      });
      return;
    }

    await chrome.storage.local.set({ summary: "Fetching policy text..." });

    const audit = await fetchAndAnalyzePolicy(cleanLink);

    // audit might be an error string; normalize
    if (typeof audit === "string") {
      await chrome.storage.local.set({ summary: audit, lastPolicyUrl: cleanLink });
      return;
    }

    await chrome.storage.local.set({
      summary: JSON.stringify(audit, null, 2),
      lastPolicyUrl: cleanLink,
      lastAudit: audit,
      [auditKey(cleanLink)]: audit,
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

async function fetchAndAnalyzePolicy(policyLink: string): Promise<object | string> {
  console.log("Fetching policy:", policyLink);

  const res = await fetch(policyLink, { credentials: "omit" });
  console.log("Policy fetch status:", res.status);

  const html = await res.text();
  const text = extractTextFromHtml(html);

  await chrome.storage.local.set({ summary: "Asking AI (can take ~5–15s)..." });

  return await callAnalyze(text);
}

function extractTextFromHtml(html: string): string {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");

  let text = cleaned.replace(/<[^>]*>/g, " ");
  text = text.replace(/\s+/g, " ").trim();

  // Smaller input = faster + fewer quota hits
  return text.slice(0, 5000);
}

async function callAnalyze(text: string): Promise<object | string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

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
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  } catch {
    return "Timed out contacting the backend. Is FastAPI running on localhost:8000?";
  } finally {
    clearTimeout(timer);
  }
}

// ---------- translate flow ----------
async function handleTranslate(language: string): Promise<void> {
  const lang = (language || "").toLowerCase().trim();
  if (!lang || lang === "english") return;

  try {
    // Get last policy + audit from storage
    const stored = await chrome.storage.local.get(["lastPolicyUrl", "lastAudit"]);
    const lastPolicyUrl: string = (stored.lastPolicyUrl as string) || "";
    const lastAudit: unknown = stored.lastAudit;

    if (!lastPolicyUrl || !lastAudit) {
      await chrome.storage.local.set({
        summary: "Nothing to translate yet — click Summarize first.",
      });
      return;
    }

    // Reuse cached translation if exists
    const tKey = translationKey(lastPolicyUrl, lang);
    const cached = await chrome.storage.local.get([tKey]);
    if (cached[tKey]) {
      console.log("Reusing cached translation:", lastPolicyUrl, lang);
      await chrome.storage.local.set({ summary: JSON.stringify(cached[tKey], null, 2) });
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
      [tKey]: translated,
    });
  } catch (err) {
    console.error("handleTranslate failed:", err);
    await chrome.storage.local.set({ summary: "Error: Could not translate." });
  }
}

async function callTranslate(audit: unknown, language: string): Promise<object | string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);

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
    return "Timed out contacting /translate. Is the backend running and exposing POST /translate?";
  } finally {
    clearTimeout(timer);
  }
}
