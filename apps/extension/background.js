chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ apiBase: "http://localhost:3001" });
});
