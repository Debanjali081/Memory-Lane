import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

export default function ItemDetail() {
  const [item, setItem] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [related, setRelated] = useState([]);
  const [relatedStrategy, setRelatedStrategy] = useState("");
  const [editingTags, setEditingTags] = useState(false);
  const [tagsValue, setTagsValue] = useState("");
  const [tagStatus, setTagStatus] = useState("");
  const [editingNote, setEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const [noteStatus, setNoteStatus] = useState("");
  const [highlights, setHighlights] = useState([]);
  const [highlightText, setHighlightText] = useState("");
  const [highlightNote, setHighlightNote] = useState("");
  const [highlightStatus, setHighlightStatus] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [selectedOffsets, setSelectedOffsets] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showFullContent, setShowFullContent] = useState(false);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const id = window.location.pathname.split("/").pop();
        const res = await apiFetch(`/items/${id}`);
        if (!res.ok) throw new Error("Failed to load");
        const data = await res.json();
        if (isMounted) {
          setItem(data);
          setTagsValue(Array.isArray(data.tags) ? data.tags.join(", ") : "");
          setNoteValue(data.metadata?.note || "");
        }
      } catch (err) {
        if (isMounted) setError("Could not load item.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!item?.id) return;
    let isMounted = true;
    async function loadRelated() {
      try {
        const res = await apiFetch(
          `/items/${item.id}/related?limit=6`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) {
          setRelated(data.items || []);
          setRelatedStrategy(data.strategy || "");
        }
      } catch {
        if (isMounted) setRelated([]);
      }
    }
    loadRelated();
    return () => {
      isMounted = false;
    };
  }, [item?.id]);

  async function removeRelated(id) {
    await apiFetch(`/items/${id}`, { method: "DELETE" });
    setRelated((prev) => prev.filter((r) => r.id !== id));
  }

  useEffect(() => {
    if (!item?.id) return;
    let isMounted = true;
    async function loadHighlights() {
      try {
        const res = await apiFetch(`/items/${item.id}/highlights`);
        if (!res.ok) return;
        const data = await res.json();
        if (isMounted) setHighlights(data.highlights || []);
      } catch {
        if (isMounted) setHighlights([]);
      }
    }
    loadHighlights();
    return () => {
      isMounted = false;
    };
  }, [item?.id]);

  async function addHighlight(text, offsets) {
    if (!item?.id || !text.trim()) return;
    setHighlightStatus("Saving...");
    try {
      const res = await apiFetch(`/items/${item.id}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: text.trim(),
          note: highlightNote.trim() || undefined,
          start_offset: offsets?.start ?? undefined,
          end_offset: offsets?.end ?? undefined,
        }),
      });
      if (!res.ok) throw new Error("highlight_failed");
      setHighlightText("");
      setSelectedText("");
      setSelectedOffsets(null);
      setHighlightNote("");
      setHighlightStatus("Saved.");
      const refresh = await apiFetch(`/items/${item.id}/highlights`);
      if (refresh.ok) {
        const data = await refresh.json();
        setHighlights(data.highlights || []);
      }
    } catch {
      setHighlightStatus("Failed.");
    }
  }

  function handleSelection() {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : "";
    if (!text || !item?.content_text) {
      setSelectedText("");
      setSelectedOffsets(null);
      return;
    }
    const start = item.content_text.indexOf(text);
    if (start >= 0) {
      setSelectedText(text);
      setSelectedOffsets({ start, end: start + text.length });
    } else {
      setSelectedText(text);
      setSelectedOffsets(null);
    }
  }

  async function saveTags() {
    if (!item) return;
    setTagStatus("Saving tags...");
    try {
      const res = await apiFetch(`/items/${item.id}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: tagsValue }),
      });
      if (!res.ok) throw new Error("tag_save_failed");
      const data = await res.json();
      setItem((prev) => ({ ...prev, tags: data.tags || [] }));
      setEditingTags(false);
      setTagStatus("Tags saved.");
    } catch {
      setTagStatus("Failed to save tags.");
    }
  }

  async function saveNote() {
    if (!item) return;
    setNoteStatus("Saving note...");
    try {
      const res = await apiFetch(`/items/${item.id}/note`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: noteValue }),
      });
      if (!res.ok) throw new Error("note_save_failed");
      const data = await res.json();
      setItem((prev) => ({ ...prev, metadata: data.metadata }));
      setEditingNote(false);
      setNoteStatus("Note saved.");
    } catch {
      setNoteStatus("Failed to save note.");
    }
  }

  return (
    <>
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
      {loading && <p>Loading…</p>}
      {error && <p>{error}</p>}
      {!loading && item && (
        <article style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, color: "#666" }}>
            {item.type} • {new Date(item.created_at).toLocaleString()}
          </div>
          <h1 style={{ marginTop: 8 }}>{item.title}</h1>
          <div style={{ marginBottom: 8 }}>
            <a
              href={item.url}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "block",
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
          </div>
          {Array.isArray(item.tags) && item.tags.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap" }}>
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
            {editingTags ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={tagsValue}
                  onChange={(e) => setTagsValue(e.target.value)}
                  placeholder="comma-separated tags"
                  style={{
                    flex: "1 1 260px",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  onClick={saveTags}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    fontSize: 12,
                  }}
                >
                  Save tags
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingTags(false);
                    setTagsValue(Array.isArray(item.tags) ? item.tags.join(", ") : "");
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #ddd",
                    background: "#fff",
                    color: "#111",
                    fontSize: 12,
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingTags(true);
                  setTagStatus("");
                }}
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
                Edit tags
              </button>
            )}
            {tagStatus && editingTags && (
              <span style={{ marginLeft: 10, fontSize: 12 }}>
                {tagStatus}
              </span>
            )}
          </div>
          {item.metadata?.note && (
            <div style={{ marginTop: 10, fontStyle: "italic", color: "#444" }}>
              “{item.metadata.note}”
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            {editingNote ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={noteValue}
                  onChange={(e) => setNoteValue(e.target.value)}
                  placeholder="Edit note..."
                  style={{
                    flex: "1 1 260px",
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #ddd",
                    fontSize: 13,
                  }}
                />
                <button
                  type="button"
                  onClick={saveNote}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #111",
                    background: "#111",
                    color: "#fff",
                    fontSize: 12,
                  }}
                >
                  Save note
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingNote(false);
                    setNoteValue(item.metadata?.note || "");
                  }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: "1px solid #ddd",
                    background: "#fff",
                    color: "#111",
                    fontSize: 12,
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingNote(true);
                  setNoteStatus("");
                }}
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
                Edit note
              </button>
            )}
            {noteStatus && editingNote && (
              <span style={{ marginLeft: 10, fontSize: 12 }}>
                {noteStatus}
              </span>
            )}
          </div>
          {/* content_text intentionally hidden in detail view */}
          <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 18 }}>Highlights</h2>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input
                value={highlightText}
                onChange={(e) => setHighlightText(e.target.value)}
                placeholder="Highlight text"
                style={{
                  flex: "1 1 260px",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  fontSize: 13,
                }}
              />
              <input
                value={highlightNote}
                onChange={(e) => setHighlightNote(e.target.value)}
                placeholder="Optional note"
                style={{
                  flex: "1 1 200px",
                  padding: "8px 10px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  fontSize: 13,
                }}
              />
              <button
                type="button"
                onClick={() => addHighlight(highlightText, null)}
                style={{
                  padding: "6px 10px",
                  borderRadius: 6,
                  border: "1px solid #111",
                  background: "#111",
                  color: "#fff",
                  fontSize: 12,
                }}
              >
                Add
              </button>
              {highlightStatus && (
                <span style={{ fontSize: 12 }}>{highlightStatus}</span>
              )}
            </div>
            {highlights.length === 0 && <p>No highlights yet.</p>}
            {highlights.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, marginTop: 10 }}>
                {highlights.map((h) => (
                  <li
                    key={h.id}
                    style={{
                      border: "1px solid #eee",
                      borderRadius: 10,
                      padding: 10,
                      marginBottom: 8,
                    }}
                  >
                    <div style={{ fontSize: 13 }}>{h.text}</div>
                    {h.note && (
                      <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>
                        {h.note}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: 18 }}>Related</h2>
            {related.length === 0 && <p>No related items yet.</p>}
            {related.length > 0 && (
              <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                {related.map((r) => (
                  <li
                    key={r.id}
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
                    <div>
                      <div style={{ fontSize: 12, color: "#666" }}>
                        {r.type} • {new Date(r.created_at).toLocaleString()}
                        {typeof r.score === "number" && (
                          <span> • score {r.score}</span>
                        )}
                      </div>
                      <a
                        href={`/items/${r.id}`}
                        style={{ color: "#111", textDecoration: "none" }}
                      >
                        {r.title}
                      </a>
                      {Array.isArray(r.shared_tags) && r.shared_tags.length > 0 && (
                        <div style={{ marginTop: 6, fontSize: 12, color: "#666" }}>
                          Why this: shared tags {r.shared_tags.join(", ")}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete({ id: r.id })}
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
            )}
            {relatedStrategy && related.length > 0 && (
              <div style={{ fontSize: 12, color: "#666" }}>
                Strategy: {relatedStrategy}
              </div>
            )}
          </section>
        </article>
      )}
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
                await removeRelated(target.id);
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
