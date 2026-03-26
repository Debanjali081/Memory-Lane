(() => {
  const meta = document.querySelector('meta[name="memory-lane-api-base"]');
  const apiBase = meta?.getAttribute("content")?.trim();
  if (!apiBase) return;
  try {
    chrome.storage.sync.set({ apiBase });
  } catch {
    // ignore
  }
})();
