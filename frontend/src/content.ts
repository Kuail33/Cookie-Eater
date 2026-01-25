// Content script - finds policy links on the page
// Only runs when triggered by background script

console.log("Content script loaded");

const currentUrl = window.location.href;

// 1) If already on a likely policy page, use current page URL directly
if (isLikelyPolicyUrl(currentUrl)) {
  console.log("Already on a policy page:", currentUrl);
  chrome.runtime.sendMessage({ type: "POLICY_FOUND", policyLink: currentUrl });
} else {
  // 2) Otherwise, find a policy link on the page
  const policyLink = findPolicyLinkOnPage();

  if (policyLink) {console.log("Policy link found:", policyLink)}
  else {console.log("No policy link found on this page")};

  chrome.runtime.sendMessage({
    type: "POLICY_FOUND",
    policyLink: policyLink ?? null,
  });
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

// Find a likely Terms / Privacy / Cookies link
function findPolicyLinkOnPage(): string | null {
  const links = document.querySelectorAll("a");

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const text = link.textContent || "";
    if (isPolicyLinkText(text)) return link.href;
  }

  return null
}

// check if link text looks like a policy link
function isPolicyLinkText(text: string): boolean {
  const t = text.toLowerCase();
  return (
    t.includes("terms") ||
    t.includes("privacy") ||
    t.includes("cookies") ||
    t.includes("policy")
  );
}
