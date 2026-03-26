import { useEffect, useState } from "react";
import { apiFetch } from "../lib/api";

export default function ClustersPage() {
  const [clusters, setClusters] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const res = await apiFetch(`/clusters?limit=30`);
        if (!res.ok) throw new Error("failed");
        const data = await res.json();
        if (isMounted) setClusters(data.clusters || []);
      } catch {
        if (isMounted) setClusters([]);
      } finally {
        if (isMounted) setLoading(false);
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
        maxWidth: 1000,
        margin: "0 auto",
      }}
    >
      <a href="/" style={{ textDecoration: "none", color: "#111" }}>
        ← Back
      </a>
      <h1 style={{ marginTop: 12 }}>Topic Clusters</h1>
      <p style={{ color: "#555" }}>
        Clusters are grouped by tags (top tags with most items).
      </p>
      {loading && <p>Loading…</p>}
      {!loading && clusters.length === 0 && <p>No clusters yet.</p>}
      <div style={{ marginTop: 16 }}>
        {clusters.map((c) => (
          <div
            key={c.name}
            style={{
              border: "1px solid #eee",
              borderRadius: 10,
              padding: 14,
              marginBottom: 12,
            }}
          >
            <div style={{ fontWeight: 600 }}>
              {c.name} ({c.count})
            </div>
            {Array.isArray(c.items) && c.items.length > 0 && (
              <ul style={{ marginTop: 6, paddingLeft: 18 }}>
                {c.items.slice(0, 6).map((title, idx) => (
                  <li key={`${c.name}-${idx}`} style={{ fontSize: 12 }}>
                    {title}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
