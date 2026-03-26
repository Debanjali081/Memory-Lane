const statusEl = document.getElementById("status");
const titleEl = document.getElementById("title");
const noteEl = document.getElementById("note");
const apiKeyEl = document.getElementById("apiKey");
const saveKeyBtn = document.getElementById("saveKey");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

async function saveItem() {
  statusEl.textContent = "Saving...";
  const tab = await getActiveTab();

  function inferType(inputUrl = "") {
    const lower = String(inputUrl).toLowerCase();
    if (lower.includes("twitter.com/") || lower.includes("x.com/")) return "tweet";
    if (lower.endsWith(".pdf")) return "pdf";
    if (lower.match(/\.(png|jpg|jpeg|gif|webp|svg)$/)) return "image";
    if (
      lower.includes("youtube.com/") ||
      lower.includes("youtu.be/") ||
      lower.includes("vimeo.com/")
    )
      return "video";
    return "article";
  }

  const payload = {
    url: tab.url,
    title: titleEl.value || tab.title,
    type: inferType(tab.url),
    note: noteEl.value || "",
  };

  const stored = await chrome.storage.sync.get(["apiBase", "apiKey"]);
  const apiBase = (stored.apiBase || "http://localhost:3001").trim();
  const apiKey = stored.apiKey || "";

  if (!apiKey) {
    statusEl.textContent = "Add API key first.";
    return;
  }

  try {
    const verifyUrl = new URL(`${apiBase}/auth/verify`);
    verifyUrl.searchParams.set("api_key", apiKey);
    const verify = await fetch(verifyUrl.toString());
    if (!verify.ok) {
      statusEl.textContent = `API key invalid for this server. (${verify.status})`;
      return;
    }
  } catch {
    statusEl.textContent = "Could not verify API key.";
    return;
  }

  const headers = { "Content-Type": "application/json" };
  let requestUrl = `${apiBase}/items`;
  if (apiKey) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
    const url = new URL(requestUrl);
    url.searchParams.set("api_key", apiKey);
    requestUrl = url.toString();
  }

  const res = await fetch(requestUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 401) {
      statusEl.textContent = "Failed to save (unauthorized). Check API key.";
    } else {
      statusEl.textContent = `Failed to save. ${detail}`.trim();
    }
    return;
  }

  statusEl.textContent = "Saved.";
}

document.getElementById("save").addEventListener("click", saveItem);

saveKeyBtn.addEventListener("click", async () => {
  const key = apiKeyEl.value.trim();
  const stored = await chrome.storage.sync.get(["apiBase"]);
  const base = (stored.apiBase || "http://localhost:3001").trim();
  await chrome.storage.sync.set({ apiKey: key });
  if (!key) {
    statusEl.textContent = "API key cleared.";
    return;
  }
  try {
    const verifyUrl = new URL(`${base}/auth/verify`);
    verifyUrl.searchParams.set("api_key", key);
    const verify = await fetch(verifyUrl.toString());
    if (!verify.ok) {
      statusEl.textContent = `Saved, but key invalid for this server. (${verify.status})`;
      return;
    }
  } catch {
    statusEl.textContent = "Saved, but could not verify key.";
    return;
  }
  statusEl.textContent = "API key saved & verified.";
});

async function init() {
  const stored = await chrome.storage.sync.get(["apiKey"]);
  if (stored.apiKey) apiKeyEl.value = stored.apiKey;
}

init();
