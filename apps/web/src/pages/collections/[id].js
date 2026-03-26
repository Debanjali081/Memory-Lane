import { useEffect, useState } from "react";
import { apiFetch } from "../../lib/api";

export default function CollectionDetail() {
  const [collection, setCollection] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("");
  const [addItemId, setAddItemId] = useState("");
  const [addStatus, setAddStatus] = useState("");

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const id = window.location.pathname.split("/").pop();
        const res = await apiFetch(`/collections/${id}`);
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (isMounted) setCollection(data);

        const itemsRes = await apiFetch(`/collections/${id}/items`);
        if (itemsRes.ok) {
          const itemsData = await itemsRes.json();
          if (isMounted) {
            setItems(itemsData.items || []);
            setMode(itemsData.mode || "");
          }
        }
      } catch {
        if (isMounted) {
          setCollection(null);
          setItems([]);
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  async function removeCollection() {
    if (!collection?.id) return;
    await apiFetch(`/collections/${collection.id}`, { method: "DELETE" });
    window.location.href = "/collections";
  }

  async function addItem() {
    if (!collection?.id || !addItemId) return;
    setAddStatus("Adding...");
    try {
      const res = await apiFetch(
        `/collections/${collection.id}/items`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ item_id: addItemId }),
        }
      );
      if (!res.ok) throw new Error("add_failed");
      setAddStatus("Added.");
      setAddItemId("");
      const itemsRes = await apiFetch(
        `/collections/${collection.id}/items`
      );
      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setItems(itemsData.items || []);
        setMode(itemsData.mode || "");
      }
    } catch {
      setAddStatus("Failed.");
    }
  }

  async function removeItem(itemId) {
    if (!collection?.id || !itemId) return;
    if (mode === "manual") {
      await apiFetch(
        `/collections/${collection.id}/items/${itemId}`,
        { method: "DELETE" }
      );
      const itemsRes = await apiFetch(
        `/collections/${collection.id}/items`
      );
      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        setItems(itemsData.items || []);
        setMode(itemsData.mode || "");
      }
    } else {
      // smart collection: remove from current view only
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    }
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
      <a href="/collections" style={{ textDecoration: "none", color: "#111" }}>
        ← Back
      </a>
      {loading && <p>Loading…</p>}
      {!loading && !collection && <p>Collection not found.</p>}
      {!loading && collection && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h1 style={{ marginTop: 12 }}>{collection.name}</h1>
            <button
              type="button"
              onClick={removeCollection}
              style={{
                padding: "6px 10px",
                borderRadius: 6,
                border: "1px solid #ddd",
                background: "#fff",
                fontSize: 12,
              }}
            >
              Remove collection
            </button>
          </div>
          {collection.rules_json && (
            <pre
              style={{
                background: "#fafafa",
                padding: 12,
                borderRadius: 8,
                fontSize: 12,
              }}
            >
              {JSON.stringify(collection.rules_json, null, 2)}
            </pre>
          )}
          {mode && (
            <div style={{ fontSize: 12, color: "#666" }}>
              Mode: {mode}
            </div>
          )}
          {mode === "manual" && (
            <section style={{ marginTop: 12 }}>
              <h2 style={{ fontSize: 16 }}>Add Item</h2>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <input
                  value={addItemId}
                  onChange={(e) => setAddItemId(e.target.value)}
                  placeholder="Item ID"
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
                  onClick={addItem}
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
                {addStatus && (
                  <span style={{ fontSize: 12 }}>{addStatus}</span>
                )}
              </div>
            </section>
          )}
          <section style={{ marginTop: 16 }}>
            <h2 style={{ fontSize: 18 }}>Items</h2>
            {items.length === 0 && <p>No items match this collection.</p>}
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {items.map((item) => (
                <li
                  key={item.id}
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
                    href={`/items/${item.id}`}
                    style={{ textDecoration: "none", color: "#111" }}
                  >
                  {item.title}
                </a>
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
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
        </>
      )}
    </main>
  );
}
