/**
 * ReagraphExplorer — knowledge graph explorer using reagraph (Three.js/WebGL).
 * Route: /reagraph
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { GraphCanvas, useSelection, darkTheme } from "reagraph";
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

const theme = {
  ...darkTheme,
  canvas: { background: "#03050e", fog: false },
  node: {
    ...darkTheme.node,
    opacity: 1,
    selectedOpacity: 1,
    inactiveOpacity: 0.06,
    label: { ...darkTheme.node.label, color: "#64748b", activeColor: "#e2e8f0", fontSize: 6 },
  },
  edge: {
    ...darkTheme.edge,
    fill: "#1a3a5c",
    activeFill: "#38bdf8",
    opacity: 0.3,
    selectedOpacity: 0.9,
    inactiveOpacity: 0.03,
  },
  ring: { fill: "#f59e0b", activeFill: "#f59e0b" },
};

const LEGEND = [
  ["Artist / Person", "#1db954"], ["Band / Group", "#8b5cf6"],
  ["Event", "#e05252"], ["Place / Venue", "#38bdf8"],
  ["Album", "#a78bfa"], ["Song", "#2dd4bf"],
  ["Organisation", "#f59e0b"], ["Other", "#4a7fa8"],
];

export default function ReagraphExplorer() {
  const graphRef = useRef(null);
  const [nodes, setNodes]   = useState([]);
  const [edges, setEdges]   = useState([]);
  const [status, setStatus] = useState("Loading…");

  const fetchedRef = useRef(new Set());
  const nodeSetRef = useRef(new Set());
  const edgeSetRef = useRef(new Set());

  const addNeighbours = useCallback(async (uri, label, cls) => {
    if (fetchedRef.current.has(uri)) return;
    fetchedRef.current.add(uri);

    if (!nodeSetRef.current.has(uri)) {
      nodeSetRef.current.add(uri);
      setNodes((prev) => [...prev, {
        id: uri,
        label: label || uri.split(/[#/]/).pop(),
        fill: typeColor(cls),
        size: 8,
      }]);
    }

    let data;
    try { data = await fetchNeighbours(uri); }
    catch { return; }

    const newNodes = [], newEdges = [];
    data.edges.slice(0, 16).forEach((e) => {
      if (!nodeSetRef.current.has(e.target_uri)) {
        nodeSetRef.current.add(e.target_uri);
        newNodes.push({
          id: e.target_uri,
          label: e.target_label,
          fill: typeColor(e.target_class),
          size: 5,
        });
      }
      const eid = `${uri}__${e.target_uri}`;
      if (!edgeSetRef.current.has(eid)) {
        edgeSetRef.current.add(eid);
        newEdges.push({ id: eid, source: uri, target: e.target_uri, label: e.predicate_label || "" });
      }
    });

    if (newNodes.length) setNodes((prev) => [...prev, ...newNodes]);
    if (newEdges.length) setEdges((prev) => [...prev, ...newEdges]);
  }, []);

  useEffect(() => {
    async function seed() {
      let suggestions;
      try { suggestions = await fetchSuggestions(14); }
      catch { setStatus("Failed to load"); return; }

      suggestions.forEach((s) => nodeSetRef.current.add(s.uri));
      setNodes(suggestions.map((s) => ({
        id: s.uri,
        label: s.label,
        fill: typeColor(s.type || s.class),
        size: 10,
      })));
      setStatus(`${suggestions.length} seed nodes — expanding…`);

      await Promise.all(suggestions.map((s) => addNeighbours(s.uri, s.label, s.type || s.class)));
      setStatus(`${nodeSetRef.current.size} nodes — click to expand`);
    }
    seed();
  }, [addNeighbours]);

  // Boost scroll zoom sensitivity once the canvas has mounted
  useEffect(() => {
    if (nodes.length === 0) return;
    const id = setTimeout(() => {
      const controls = graphRef.current?.getControls();
      if (controls) controls.dollySpeed = 3;
    }, 500);
    return () => clearTimeout(id);
  }, [nodes.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  const { selections, actives, onNodeClick, onCanvasClick, onNodePointerOver, onNodePointerOut } =
    useSelection({
      ref: graphRef,
      nodes,
      edges,
      type: "single",
      pathHoverType: "direct",
      focusOnSelect: false,
    });

  const handleNodeClick = useCallback(async (node) => {
    onNodeClick(node);
    setStatus("Expanding…");
    await addNeighbours(node.id, node.label, null);
    setStatus(`${nodeSetRef.current.size} nodes — click to expand`);
  }, [onNodeClick, addNeighbours]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#03050e", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderBottom: "1px solid #0d1117", flexShrink: 0 }}>
        <span style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em" }}>MEMORIA</span>
        <span style={{ color: "#1e3347", fontSize: 13 }}>reagraph</span>
        <span style={{ marginLeft: "auto", color: "#1e3347", fontSize: 12 }}>{status}</span>
        <Link to="/explore" style={{ color: "#38bdf8", fontSize: 12, textDecoration: "none" }}>Explorer</Link>
        <Link to="/cosmos" style={{ color: "#1e3347", fontSize: 12, textDecoration: "none" }}>Cosmos</Link>
        <Link to="/" style={{ color: "#1e3347", fontSize: 12, textDecoration: "none" }}>← Desktop</Link>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        {nodes.length > 0 && (
          <GraphCanvas
            ref={graphRef}
            nodes={nodes}
            edges={edges}
            theme={theme}
            selections={selections}
            actives={actives}
            onNodeClick={handleNodeClick}
            onCanvasClick={onCanvasClick}
            onNodePointerOver={onNodePointerOver}
            onNodePointerOut={onNodePointerOut}
            layoutType="forceDirected2d"
            labelType="all"
            edgeLabelPosition="inline"
            animated={false}
            draggable
          />
        )}
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
