import { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import { apiFetch } from "../lib/api";

export default function GraphPage() {
  const svgRef = useRef(null);
  const [data, setData] = useState({ nodes: [], links: [] });

  useEffect(() => {
    let isMounted = true;
    async function load() {
      try {
        const res = await apiFetch(`/graph?limit=80&max_edges=160`);
        if (!res.ok) throw new Error("failed");
        const json = await res.json();
        if (isMounted) setData(json);
      } catch {
        if (isMounted) setData({ nodes: [], links: [] });
      }
    }
    load();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const svg = d3.select(svgRef.current);
    const width = 900;
    const height = 600;

    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${width} ${height}`);

    if (!data.nodes.length) return;

    const links = data.links.map((d) => ({ ...d }));
    const nodes = data.nodes.map((d) => ({ ...d }));

    const simulation = d3
      .forceSimulation(nodes)
      .force(
        "link",
        d3.forceLink(links).id((d) => d.id).distance(90).strength(0.4)
      )
      .force("charge", d3.forceManyBody().strength(-160))
      .force("center", d3.forceCenter(width / 2, height / 2));

    const container = svg.append("g");

    svg.call(
      d3
        .zoom()
        .scaleExtent([0.4, 3])
        .on("zoom", (event) => {
          container.attr("transform", event.transform);
        })
    );

    const link = container
      .append("g")
      .attr("stroke", "#bbb")
      .attr("stroke-opacity", 0.6)
      .selectAll("line")
      .data(links)
      .enter()
      .append("line")
      .attr("stroke-width", (d) => Math.max(1, Math.min(4, d.weight || 1)));

    const node = container
      .append("g")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.2)
      .selectAll("circle")
      .data(nodes)
      .enter()
      .append("circle")
      .attr("r", 6)
      .attr("fill", (d) =>
        d.type === "tweet"
          ? "#1DA1F2"
          : d.type === "video"
            ? "#FF3B30"
            : d.type === "image"
              ? "#34C759"
              : d.type === "pdf"
                ? "#FF9500"
                : "#111"
      )
      .style("cursor", "pointer")
      .on("click", (_, d) => {
        window.location.href = `/items/${d.id}`;
      })
      .call(
        d3
          .drag()
          .on("start", (event, d) => {
            if (!event.active) simulation.alphaTarget(0.3).restart();
            d.fx = d.x;
            d.fy = d.y;
          })
          .on("drag", (event, d) => {
            d.fx = event.x;
            d.fy = event.y;
          })
          .on("end", (event, d) => {
            if (!event.active) simulation.alphaTarget(0);
            d.fx = null;
            d.fy = null;
          })
      );

    const label = container
      .append("g")
      .selectAll("text")
      .data(nodes)
      .enter()
      .append("text")
      .text((d) => d.title)
      .attr("font-size", 10)
      .attr("fill", "#333")
      .attr("dx", 8)
      .attr("dy", 3);

    node.append("title").text((d) => d.title);

    simulation.on("tick", () => {
      link
        .attr("x1", (d) => d.source.x)
        .attr("y1", (d) => d.source.y)
        .attr("x2", (d) => d.target.x)
        .attr("y2", (d) => d.target.y);

      node.attr("cx", (d) => d.x).attr("cy", (d) => d.y);
      label.attr("x", (d) => d.x).attr("y", (d) => d.y);
    });

    return () => {
      simulation.stop();
    };
  }, [data]);

  return (
    <main
      className="page"
      style={{
        padding: 32,
        maxWidth: 1000,
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: 16 }}>
        <a href="/" style={{ textDecoration: "none", color: "#111" }}>
          ← Back
        </a>
      </div>
      <h1 style={{ marginBottom: 8 }}>Graph</h1>
      <p style={{ color: "#555", marginBottom: 16 }}>
        Nodes are items, edges connect items that share tags.
      </p>
      <div
        style={{
          border: "1px solid #eee",
          borderRadius: 12,
          padding: 12,
          background: "#fafafa",
        }}
      >
        <svg ref={svgRef} width="100%" height="600" />
      </div>
    </main>
  );
}
