
(function () {
  const policyLink = findPolicyLinkOnPage();

  chrome.runtime.sendMessage({
    type: "POLICY_FOUND",
    policyLink: policyLink
  });
})();

//Find a likely Terms / Privacy / Cookies link

function findPolicyLinkOnPage(): string | null {
  const links = document.querySelectorAll("a");

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    const text = link.textContent || "";

    if (isPolicyLinkText(text)) {
      return link.href;
    }
  }

  return null;
}


// check if link text looks like a policy link

function isPolicyLinkText(text: string): boolean {
  text = text.toLowerCase();

  return (
    text.includes("terms") ||
    text.includes("privacy") ||
    text.includes("cookies") ||
    text.includes("policy")
  );
}
