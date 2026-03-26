export const apiBase =
  process.env.NEXT_PUBLIC_API_BASE || "http://localhost:3001";

let memoryApiKey = "";

export function getApiKey() {
  if (typeof window === "undefined") return "";
  if (window.__api_key) return window.__api_key;
  try {
    return (
      window.localStorage.getItem("api_key") ||
      window.localStorage.getItem("api-key") ||
      window.sessionStorage.getItem("api_key") ||
      window.sessionStorage.getItem("api-key") ||
      memoryApiKey
    );
  } catch {
    return memoryApiKey;
  }
}

export function setApiKey(key) {
  if (typeof window === "undefined") return;
  const cleaned = String(key || "").trim();
  if (!cleaned) return;
  memoryApiKey = cleaned;
  window.__api_key = cleaned;
  try {
    window.localStorage.setItem("api_key", cleaned);
    window.localStorage.setItem("api-key", cleaned);
    window.sessionStorage.setItem("api_key", cleaned);
    window.sessionStorage.setItem("api-key", cleaned);
  } catch {
    // Ignore storage failures (private mode, blocked storage, etc).
  }
}

export function clearApiKey() {
  if (typeof window === "undefined") return;
  memoryApiKey = "";
  delete window.__api_key;
  try {
    window.localStorage.removeItem("api_key");
    window.localStorage.removeItem("api-key");
    window.sessionStorage.removeItem("api_key");
    window.sessionStorage.removeItem("api-key");
  } catch {
    // Ignore storage failures.
  }
}

export async function apiFetch(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const apiKey = getApiKey();
  const sentAuth = Boolean(apiKey);
  if (sentAuth) {
    headers.Authorization = `Bearer ${apiKey}`;
    headers["x-api-key"] = apiKey;
  }

  const res = await fetch(`${apiBase}${path}`, {
    ...options,
    headers,
  });

  if (res.status === 401 && typeof window !== "undefined") {
    if (sentAuth) {
      const retryUrl = new URL(`${apiBase}${path}`);
      if (!retryUrl.searchParams.get("api_key")) {
        retryUrl.searchParams.set("api_key", apiKey);
      }
      const retryRes = await fetch(retryUrl.toString(), {
        ...options,
        headers,
      });
      if (retryRes.status !== 401) return retryRes;
    }
    try {
      window.localStorage.setItem(
        "last_401",
        JSON.stringify({
          path,
          time: new Date().toISOString(),
          hadAuth: sentAuth,
          keyLength: apiKey ? apiKey.length : 0,
        })
      );
    } catch {
      // ignore
    }
    if (window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
  }

  return res;
}
