import { useEffect, useState } from "react";
import { apiFetch, clearApiKey } from "../lib/api";

export default function ProfilePage() {
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("Loading...");

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const res = await apiFetch(`/auth/me`);
        if (!res.ok) {
          setStatus("Not authenticated.");
          return;
        }
        const data = await res.json();
        if (isMounted) {
          setProfile(data);
          setStatus("");
        }
      } catch {
        if (isMounted) setStatus("Failed to load profile.");
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main
      className="page"
      style={{
        padding: 32,
        maxWidth: 640,
        margin: "0 auto",
      }}
    >
      <a href="/" style={{ textDecoration: "none", color: "#111" }}>
        ← Back
      </a>
      <h1 style={{ marginTop: 12 }}>Profile</h1>
      {status && <p style={{ color: "#666" }}>{status}</p>}
      {profile && (
        <div
          style={{
            border: "1px solid #eee",
            borderRadius: 12,
            padding: 16,
            marginTop: 16,
            background: "#fff",
          }}
        >
          <div style={{ fontSize: 12, color: "#666" }}>Email</div>
          <div style={{ fontSize: 16, marginBottom: 12 }}>
            {profile.email}
          </div>
          <div style={{ fontSize: 12, color: "#666" }}>API Key</div>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: 12,
              background: "#f5f5f5",
              padding: "8px 10px",
              borderRadius: 8,
              wordBreak: "break-all",
            }}
          >
            {profile.api_key}
          </div>
          <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard?.writeText(profile.api_key || "");
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #111",
                background: "#111",
                color: "#fff",
                fontSize: 12,
              }}
            >
              Copy API Key
            </button>
            <button
              type="button"
              onClick={() => {
                clearApiKey();
                window.location.href = "/login";
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
                background: "#fff",
                fontSize: 12,
              }}
            >
              Logout
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
