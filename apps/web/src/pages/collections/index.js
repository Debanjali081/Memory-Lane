import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

export default function CollectionsPage() {
  const [collections, setCollections] = useState([]);
  const [name, setName] = useState("");
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [tag, setTag] = useState("");
  const [manual, setManual] = useState(false);
  const [status, setStatus] = useState("");

  async function loadCollections() {
    try {
      const res = await apiFetch(`/collections`);
      if (!res.ok) return;
      const data = await res.json();
      setCollections(data.collections || []);
    } catch {
      setCollections([]);
    }
  }

  useEffect(() => {
    loadCollections();
  }, []);

  async function createCollection(e) {
    e.preventDefault();
    setStatus("Creating...");
    try {
      const res = await apiFetch(`/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          rules: manual
            ? {}
            : {
                q: q || "",
                type: type === "all" ? undefined : type,
                tag: tag || undefined,
              },
        }),
      });
      if (!res.ok) throw new Error("create_failed");
      setName("");
      setQ("");
      setType("all");
      setTag("");
      setManual(false);
      setStatus("Created.");
      await loadCollections();
    } catch {
      setStatus("Failed.");
    }
  }

  async function removeCollection(id) {
    await apiFetch(`/collections/${id}`, { method: "DELETE" });
    await loadCollections();
  }

  return (
    <main
      className="page"
      style={{
        padding: 32,
        maxWidth: 900,
        margin: "0 auto",
      }}
    >
      <a href="/" style={{ textDecoration: "none", color: "#111" }}>
        ← Back
      </a>
      <h1 style={{ marginTop: 12 }}>Collections</h1>

      <section style={{ marginTop: 16 }}>
        <h2 style={{ fontSize: 18 }}>Create Smart Collection</h2>
        <form onSubmit={createCollection}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Collection name"
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
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search query"
              style={{
                flex: "1 1 220px",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            />
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            >
              <option value="all">All types</option>
              <option value="article">Article</option>
              <option value="tweet">Tweet</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="pdf">PDF</option>
              <option value="note">Note</option>
            </select>
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="Tag"
              style={{
                flex: "1 1 160px",
                padding: "8px 10px",
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <input
                type="checkbox"
                checked={manual}
                onChange={(e) => setManual(e.target.checked)}
              />
              Manual collection
            </label>
          </div>
          <button
            type="submit"
            style={{
              marginTop: 10,
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              fontSize: 12,
            }}
          >
            Create
          </button>
          {status && <span style={{ marginLeft: 10, fontSize: 12 }}>{status}</span>}
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 18 }}>Your Collections</h2>
        {collections.length === 0 && <p>No collections yet.</p>}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {collections.map((c) => (
            <li
              key={c.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 10,
                padding: 12,
                marginBottom: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <a
                href={`/collections/${c.id}`}
                style={{ textDecoration: "none", color: "#111" }}
              >
                {c.name}
              </a>
              <button
                type="button"
                onClick={() => removeCollection(c.id)}
                style={{
                  padding: "4px 8px",
                  borderRadius: 6,
                  border: "1px solid #ddd",
                  background: "#fff",
                  fontSize: 12,
                }}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
