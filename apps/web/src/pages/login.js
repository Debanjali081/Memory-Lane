import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { apiBase, apiFetch, setApiKey } from "../lib/api";

export default function LoginPage() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [last401, setLast401] = useState("");
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem("last_401");
      if (raw) setLast401(raw);
    } catch {
      // ignore
    }
  }, []);

  async function submit(e) {
    e.preventDefault();
    setStatus("Working...");
    try {
      const res = await fetch(`${apiBase}/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) throw new Error("auth_failed");
      const data = await res.json();
      if (data.api_key) {
        setApiKey(data.api_key);
        const verify = await fetch(`${apiBase}/auth/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ api_key: data.api_key }),
        });
        if (!verify.ok) {
          setStatus(
            "Saved key, but API couldn't verify it. Check DB connection."
          );
          return;
        }
        setStatus(`Key saved (${String(data.api_key).length} chars).`);
        router.push("/");
      } else {
        setStatus("No api key returned.");
      }
    } catch {
      setStatus("Failed. Check credentials.");
    }
  }

  return (
    <main
      className="page"
      style={{
        padding: 32,
        maxWidth: 520,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: 8 }}>
        {mode === "login" ? "Login" : "Register"}
      </h1>
      <p style={{ color: "#555", marginBottom: 16 }}>
        Use your email and password to get an API key.
      </p>
      <form onSubmit={submit}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 16,
            border: "1px solid #ddd",
            borderRadius: 8,
            marginBottom: 10,
          }}
        />
        <input
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type="password"
          required
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 16,
            border: "1px solid #ddd",
            borderRadius: 8,
            marginBottom: 10,
          }}
        />
        <button
          type="submit"
          style={{
            padding: "10px 14px",
            borderRadius: 8,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 14,
          }}
        >
          {mode === "login" ? "Login" : "Register"}
        </button>
      {status && (
        <span style={{ marginLeft: 10, fontSize: 12 }}>{status}</span>
      )}
      {last401 && (
        <div style={{ marginTop: 12, fontSize: 12, color: "#a33" }}>
          Last 401: {last401}
        </div>
      )}
      </form>
      <div style={{ marginTop: 16, fontSize: 12 }}>
        {mode === "login" ? (
          <button
            type="button"
            onClick={() => setMode("register")}
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#111",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Need an account? Register
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setMode("login")}
            style={{
              padding: 0,
              border: "none",
              background: "transparent",
              color: "#111",
              textDecoration: "underline",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Already have an account? Login
          </button>
        )}
      </div>
    </main>
  );
}
