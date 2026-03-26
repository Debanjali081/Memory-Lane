import { useEffect, useMemo, useState } from "react";
import { apiFetch, clearApiKey } from "../lib/api";

export default function Home() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [saveUrl, setSaveUrl] = useState("");
  const [saveTitle, setSaveTitle] = useState("");
  const [saveNote, setSaveNote] = useState("");
  const [saveType, setSaveType] = useState("article");
  const [saveStatus, setSaveStatus] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [filterType, setFilterType] = useState("all");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [tagSearch, setTagSearch] = useState("");
  const [resurfaceItems, setResurfaceItems] = useState([]);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const title = useMemo(
    () => (query ? `Results for "${query}"` : "Latest Saves"),
    [query]
  );

  const [allTags, setAllTags] = useState([]);

  useEffect(() => {
    let isMounted = true;
    async function loadTags() {
      try {
        const res = await apiFetch(`/tags`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) setAllTags(data.tags || []);
      } catch {
        if (isMounted) setAllTags([]);
      }
    }
    loadTags();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    async function loadResurface() {
      try {
        const res = await apiFetch(`/resurface?limit=5&days=30`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) setResurfaceItems(data.items || []);
      } catch {
        if (isMounted) setResurfaceItems([]);
      }
    }
    loadResurface();
    return () => {
      isMounted = false;
    };
  }, []);

  const availableTags = useMemo(() => {
    const entries = allTags.map((t) => ({
      name: t.name,
      count: Number(t.count || 0),
    }));
    const map = new Map();
    for (const entry of entries) {
      if (!map.has(entry.name)) map.set(entry.name, entry.count);
    }
    return Array.from(map.entries())
      .map(([name, count]) => ({ name, count }))
      .filter((t) =>
        tagSearch
          ? t.name.toLowerCase().includes(tagSearch.toLowerCase())
          : true
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allTags, tagSearch]);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const params = new URLSearchParams();
        params.set("q", query);
        if (filterType && filterType !== "all") params.set("type", filterType);
        if (filterFrom) params.set("from", filterFrom);
        if (filterTo) params.set("to", filterTo);
        if (filterTag) params.set("tag", filterTag);
        const res = await apiFetch(`/search?${params.toString()}`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (isMounted) setItems(data.items || []);
      } catch (err) {
        if (isMounted) setError("Could not load items.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, [query, filterType, filterFrom, filterTo, filterTag]);

  async function handleSave(e) {
    e.preventDefault();
    setSaveStatus("Saving...");
    try {
      const res = await apiFetch(`/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: saveType === "note" ? undefined : saveUrl,
          title: saveTitle || undefined,
          type: saveType,
          note: saveNote || undefined,
        }),
      });
      if (!res.ok) throw new Error("save_failed");
      setSaveUrl("");
      setSaveTitle("");
      setSaveNote("");
      setSaveType("article");
      setSaveStatus("Saved.");
      setQuery("");
    } catch (err) {
      setSaveStatus("Failed to save.");
    }
  }

  async function removeFromMain(id) {
    await apiFetch(`/items/${id}`, { method: "DELETE" });
    setItems((prev) => prev.filter((i) => i.id !== id));
  }

  async function removeFromResurface(id) {
    await apiFetch(`/items/${id}`, { method: "DELETE" });
    setResurfaceItems((prev) => prev.filter((i) => i.id !== id));
  }

  return (
    <>
      <main
        className="page"
        style={{
          position: "relative",
          padding: 32,
          maxWidth: 900,
          margin: "0 auto",
        }}
      >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
        }}
      >
        <h1 style={{ fontSize: 36, marginBottom: 8 }}>Memory Lane</h1>
        <div style={{ display: "flex", gap: 12, fontSize: 12, alignItems: "center" }}>
          <a href="/graph" style={{ textDecoration: "none", color: "#111" }}>
            Graph
          </a>
          <a href="/clusters" style={{ textDecoration: "none", color: "#111" }}>
            Clusters
          </a>
          <a href="/collections" style={{ textDecoration: "none", color: "#111" }}>
            Collections
          </a>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          top: 24,
          right: 24,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <a
          href="/profile"
          title="Profile"
          style={{
            width: 32,
            height: 32,
            borderRadius: "50%",
            border: "1px solid #111",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#111",
            textDecoration: "none",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" />
            <path
              d="M4 20c1.8-3.2 5-5 8-5s6.2 1.8 8 5"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </a>
        <button
          type="button"
          onClick={() => {
            clearApiKey();
            window.location.href = "/login";
          }}
          style={{
            padding: "6px 10px",
            borderRadius: 6,
            border: "1px solid #111",
            background: "#111",
            color: "#fff",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          Logout
        </button>
      </div>
      <p style={{ maxWidth: 640 }}>
        Save anything from the web and let the system organize, relate, and
        resurface it for you.
      </p>

      {resurfaceItems.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2 style={{ fontSize: 20, marginBottom: 12 }}>Resurface</h2>
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {resurfaceItems.map((item) => (
              <li
                key={`resurface-${item.id}`}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: 14,
                  marginBottom: 10,
                  background: "#fafafa",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <div style={{ fontSize: 12, color: "#666" }}>
                      {item.type}
                    </div>
                    <a
                      href={`/items/${item.id}`}
                      style={{ color: "#111", textDecoration: "none" }}
                    >
                      {item.title}
                    </a>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDelete({ id: item.id, scope: "resurface" })
                    }
                    style={{
                      padding: "4px 8px",
                      borderRadius: 6,
                      border: "1px solid #ddd",
                      background: "#fff",
                      fontSize: 12,
                      height: 28,
                    }}
                  >
                    Remove
                  </button>
                </div>
                {item.reason && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#444" }}>
                    {item.reason}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>Quick Save</h2>
        <form onSubmit={handleSave}>
          <input
            value={saveUrl}
            onChange={(e) => setSaveUrl(e.target.value)}
            placeholder={saveType === "note" ? "Optional URL..." : "Paste URL..."}
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 16,
              border: "1px solid #ddd",
              borderRadius: 8,
              marginBottom: 10,
            }}
            required={saveType !== "note"}
          />
          <input
            value={saveTitle}
            onChange={(e) => setSaveTitle(e.target.value)}
            placeholder="Optional title"
            style={{
              width: "100%",
              padding: "10px 12px",
              fontSize: 16,
              border: "1px solid #ddd",
              borderRadius: 8,
              marginBottom: 10,
            }}
          />
          <textarea
            value={saveNote}
            onChange={(e) => setSaveNote(e.target.value)}
            placeholder="Optional note"
            rows={3}
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
            Save
          </button>
          {saveStatus && (
            <span style={{ marginLeft: 12, fontSize: 12 }}>
              {saveStatus}
            </span>
          )}
        </form>
      </section>

      <section style={{ marginTop: 24 }}>
        <label style={{ display: "block", marginBottom: 8 }}>
          Search
        </label>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your saves..."
          style={{
            width: "100%",
            padding: "10px 12px",
            fontSize: 16,
            border: "1px solid #ddd",
            borderRadius: 8,
          }}
        />
      </section>

      <section style={{ marginTop: 16 }}>
        <label style={{ display: "block", marginBottom: 8 }}>
          Filters
        </label>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
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
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
            }}
          />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            style={{
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #ddd",
            }}
          />
          <button
            type="button"
            onClick={() => {
              setQuery("");
              setFilterType("all");
              setFilterFrom("");
              setFilterTo("");
              setFilterTag("");
            }}
            style={{
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid #111",
              background: "#fff",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            Clear filters
          </button>
        </div>
        {availableTags.length > 0 && (
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder="Search tags..."
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid #ddd",
                fontSize: 12,
              }}
            />
            {availableTags.map((tag) => (
              <button
                key={`filter-${tag.name}`}
                type="button"
                onClick={() => setFilterTag(tag.name)}
                style={{
                  padding: "4px 10px",
                  borderRadius: 999,
                  border:
                    filterTag === tag.name ? "1px solid #111" : "1px solid #ddd",
                  background: filterTag === tag.name ? "#111" : "#fff",
                  color: filterTag === tag.name ? "#fff" : "#111",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {tag.name} {tag.count ? `(${tag.count})` : ""}
              </button>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <h2 style={{ fontSize: 20, marginBottom: 12 }}>{title}</h2>
        {loading && <p>Loading…</p>}
        {error && <p>{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p>No items yet.</p>
        )}
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {items.map((item) => (
            <li
              key={item.id}
              style={{
                border: "1px solid #eee",
                borderRadius: 10,
                padding: 16,
                marginBottom: 12,
              }}
            >
              <div style={{ fontSize: 12, color: "#666" }}>
                {item.type} • {new Date(item.created_at).toLocaleString()}
              </div>
              <div style={{ fontSize: 18, marginTop: 6 }}>
                <a
                  href={`/items/${item.id}`}
                  style={{ color: "#111", textDecoration: "none" }}
                >
                  {item.title}
                </a>
              </div>
              {item.metadata?.note && (
                <div style={{ marginTop: 6, fontStyle: "italic", color: "#444" }}>
                  “{item.metadata.note}”
                </div>
              )}
              {Array.isArray(item.tags) && item.tags.length > 0 && (
                <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {item.tags.map((tag) => (
                    <span
                      key={`${item.id}-${tag}`}
                      style={{
                        fontSize: 12,
                        border: "1px solid #ddd",
                        borderRadius: 999,
                        padding: "2px 8px",
                        color: "#333",
                      }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 8 }}>
                <a
                  href={item.url}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "block",
                    color: "#1d1d1f",
                    textDecoration: "none",
                    fontSize: 12,
                    maxWidth: "100%",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                  title={item.url}
                >
                  {item.url}
                </a>
                <div style={{ marginTop: 6, display: "flex", gap: 8, alignItems: "center" }}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      padding: "4px 8px",
                      border: "1px solid #111",
                      borderRadius: 6,
                      fontSize: 12,
                      textDecoration: "none",
                      color: "#111",
                    }}
                  >
                    Open
                  </a>
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmDelete({ id: item.id, scope: "main" })
                    }
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
                </div>
              </div>
              {/* content_text intentionally hidden in list view */}
            </li>
          ))}
        </ul>
      </section>
      </main>
      {confirmDelete && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.35)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: 20,
              width: "min(420px, 92vw)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: 8 }}>
              Delete this item?
            </h3>
            <p style={{ marginTop: 0, color: "#555", fontSize: 14 }}>
              This will permanently remove the item from your database.
            </p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  background: "#fff",
                  fontSize: 12,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  const target = confirmDelete;
                  setConfirmDelete(null);
                  if (!target) return;
                  if (target.scope === "resurface") {
                    await removeFromResurface(target.id);
                  } else {
                    await removeFromMain(target.id);
                  }
                }}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontSize: 12,
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
