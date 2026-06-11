/**
 * SigmaExplorer — Sigma.js + graphology knowledge graph explorer.
 * Route: /sigma
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { SigmaContainer, useRegisterEvents, useSigma } from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import { fetchSuggestions, fetchNeighbours } from "../api";

const TYPE_COLOR = {
  person: "#1db954", artist: "#1db954",
  musicgroup: "#8b5cf6", band: "#8b5cf6",
  event: "#e05252", concert: "#e05252", performance: "#e05252",
  place: "#38bdf8", stadium: "#38bdf8", venue: "#38bdf8",
  album: "#a78bfa", musicalbum: "#a78bfa",
  song: "#2dd4bf", musicrecording: "#2dd4bf",
  organization: "#f59e0b",
  default: "#4a7fa8",
};
function typeColor(cls) {
  return TYPE_COLOR[(cls || "").toLowerCase()] ?? TYPE_COLOR.default;
}

const LEGEND = [
  ["Artist / Person", "#1db954"], ["Band / Group", "#8b5cf6"],
  ["Event", "#e05252"], ["Place / Venue", "#38bdf8"],
  ["Album", "#a78bfa"], ["Song", "#2dd4bf"],
  ["Organisation", "#f59e0b"], ["Other", "#4a7fa8"],
];

const SIGMA_SETTINGS = {
  renderEdgeLabels: true,
  defaultEdgeColor: "#1a3a5c",
  defaultEdgeType: "arrow",
  labelColor: { color: "#64748b" },
  edgeLabelColor: { color: "#2a3a4c" },
  labelSize: 11,
  edgeLabelSize: 8,
  labelRenderedSizeThreshold: 0,
  zoomingRatio: 1.8,
  minCameraRatio: 0.02,
  maxCameraRatio: 8,
  enableEdgeEvents: true,
};

// ── Inner controller — runs inside SigmaContainer context ────────────────────
function GraphController({ graph, onStatusChange }) {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();
  const fetchedRef = useRef(new Set());
  const layoutTimer = useRef(null);
  const focusRef = useRef(null); // currently selected/hovered node id

  const runLayout = useCallback(() => {
    clearTimeout(layoutTimer.current);
    layoutTimer.current = setTimeout(() => {
      if (graph.order < 2) return;
      const positions = forceAtlas2(graph, {
        iterations: 100,
        settings: { ...forceAtlas2.inferSettings(graph), gravity: 1 },
      });
      Object.entries(positions).forEach(([id, { x, y }]) => {
        if (graph.hasNode(id)) graph.mergeNodeAttributes(id, { x, y });
      });
      sigma.refresh();
    }, 150);
  }, [graph, sigma]);

  const applyFocus = useCallback((nodeId) => {
    focusRef.current = nodeId;
    if (!nodeId) {
      sigma.setSetting("nodeReducer", null);
      sigma.setSetting("edgeReducer", null);
      return;
    }
    const neighbours = new Set(graph.neighbors(nodeId));
    sigma.setSetting("nodeReducer", (node, data) => {
      if (node === nodeId)       return { ...data, highlighted: true, size: data.size * 1.5, zIndex: 2 };
      if (neighbours.has(node)) return { ...data, highlighted: true, zIndex: 1 };
      return { ...data, color: "#0d1520", label: "" };
    });
    sigma.setSetting("edgeReducer", (edge, data) => {
      const s = graph.source(edge), t = graph.target(edge);
      if (s === nodeId || t === nodeId) return { ...data, color: "#38bdf8", size: 2 };
      return { ...data, color: "#080e18", label: "" };
    });
  }, [graph, sigma]);

  const addNeighbours = useCallback(async (uri, label, cls) => {
    if (fetchedRef.current.has(uri)) return;
    fetchedRef.current.add(uri);

    if (!graph.hasNode(uri)) {
      graph.addNode(uri, {
        label: label || uri.split(/[#/]/).pop(),
        color: typeColor(cls),
        size: 7,
        x: Math.random() * 100,
        y: Math.random() * 100,
      });
    }

    let data;
    try { data = await fetchNeighbours(uri); }
    catch { return; }

    let changed = false;
    data.edges.slice(0, 16).forEach((e) => {
      if (!graph.hasNode(e.target_uri)) {
        graph.addNode(e.target_uri, {
          label: e.target_label,
          color: typeColor(e.target_class),
          size: 5,
          x: Math.random() * 100,
          y: Math.random() * 100,
        });
        changed = true;
      }
      const eid = `${uri}__${e.target_uri}`;
      if (!graph.hasEdge(eid)) {
        try {
          graph.addEdgeWithKey(eid, uri, e.target_uri, {
            label: e.predicate_label || "",
            size: 1,
          });
          changed = true;
        } catch { /* skip parallel */ }
      }
    });

    if (changed) {
      sigma.refresh();
      runLayout();
      // re-apply focus so newly added neighbours get highlighted
      if (focusRef.current) applyFocus(focusRef.current);
    }
  }, [graph, sigma, runLayout, applyFocus]);

  // Seed
  useEffect(() => {
    async function seed() {
      let suggestions;
      try { suggestions = await fetchSuggestions(14); }
      catch { onStatusChange("Failed to load"); return; }

      suggestions.forEach((s) => {
        if (!graph.hasNode(s.uri)) {
          graph.addNode(s.uri, {
            label: s.label,
            color: typeColor(s.type || s.class),
            size: 10,
            x: Math.random() * 100,
            y: Math.random() * 100,
          });
        }
      });
      sigma.refresh();
      runLayout();
      onStatusChange(`${graph.order} seed nodes — expanding…`);

      await Promise.all(suggestions.map((s) => addNeighbours(s.uri, s.label, s.type || s.class)));
      onStatusChange(`${graph.order} nodes — click to expand`);
    }
    seed();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Events
  useEffect(() => {
    registerEvents({
      clickNode: async ({ node }) => {
        const next = focusRef.current === node ? null : node;
        applyFocus(next);
        if (next) {
          const attrs = graph.getNodeAttributes(node);
          onStatusChange("Expanding…");
          await addNeighbours(node, attrs.label, null);
          onStatusChange(`${graph.order} nodes — click to expand`);
        }
      },
      clickStage: () => applyFocus(null),
      enterNode: ({ node }) => { if (!focusRef.current) applyFocus(node); },
      leaveNode: () => { if (!focusRef.current) applyFocus(null); },
    });
  }, [registerEvents, graph, applyFocus, addNeighbours, onStatusChange]);

  return null;
}

// ── Page shell ────────────────────────────────────────────────────────────────
export default function SigmaExplorer() {
  const [status, setStatus] = useState("Loading…");
  // Create graph inside component so it resets cleanly on remount
  const graph = useRef(new Graph({ multi: false, allowSelfLoops: false })).current;

  return (
    <div style={{ position: "fixed", inset: 0, background: "#03050e", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderBottom: "1px solid #0d1117", flexShrink: 0 }}>
        <span style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em" }}>MEMORIA</span>
        <span style={{ color: "#1e3347", fontSize: 13 }}>sigma</span>
        <span style={{ marginLeft: "auto", color: "#1e3347", fontSize: 12 }}>{status}</span>
        <Link to="/reagraph" style={{ color: "#1e3347", fontSize: 12, textDecoration: "none" }}>Reagraph</Link>
        <Link to="/explore" style={{ color: "#38bdf8", fontSize: 12, textDecoration: "none" }}>Explorer</Link>
        <Link to="/" style={{ color: "#1e3347", fontSize: 12, textDecoration: "none" }}>← Desktop</Link>
      </div>

      <div style={{ flex: 1, minHeight: 0, ["--sigma-background-color"]: "#03050e" }}>
        <SigmaContainer
          graph={graph}
          style={{ width: "100%", height: "100%", background: "#03050e" }}
          settings={SIGMA_SETTINGS}
        >
          <GraphController graph={graph} onStatusChange={setStatus} />
        </SigmaContainer>
      </div>

      <div style={{ display: "flex", gap: 14, padding: "8px 20px", flexWrap: "wrap", borderTop: "1px solid #0d1117", flexShrink: 0 }}>
        {LEGEND.map(([label, color]) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#1e3347" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
