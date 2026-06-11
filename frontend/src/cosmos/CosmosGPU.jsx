/**
 * CosmosGPU — pure @cosmograph/react implementation.
 * Best on a machine with a dedicated GPU.
 * Visit /cosmos-gpu
 */
import { useEffect, useRef, useState, useCallback, lazy, Suspense } from "react";
import { Link } from "react-router-dom";
import { fetchSuggestions, fetchNeighbours } from "../api";

const Cosmograph = lazy(() =>
  import("@cosmograph/react").then((m) => ({ default: m.Cosmograph }))
);

const TYPE_RGBA = {
  person:         [29,  185,  84, 255],
  artist:         [29,  185,  84, 255],
  musicgroup:     [139,  92, 246, 255],
  band:           [139,  92, 246, 255],
  event:          [224,  82,  82, 255],
  concert:        [224,  82,  82, 255],
  performance:    [224,  82,  82, 255],
  place:          [ 56, 189, 248, 255],
  stadium:        [ 56, 189, 248, 255],
  venue:          [ 56, 189, 248, 255],
  album:          [167, 139, 250, 255],
  musicalbum:     [167, 139, 250, 255],
  song:           [ 45, 212, 191, 255],
  musicrecording: [ 45, 212, 191, 255],
  organization:   [245, 158,  11, 255],
  default:        [ 74, 127, 168, 255],
};

const TYPE_HEX = {
  "Artist / Person": "#1db954",
  "Band / Group":    "#8b5cf6",
  "Event":           "#e05252",
  "Place / Venue":   "#38bdf8",
  "Album":           "#a78bfa",
  "Song":            "#2dd4bf",
  "Organisation":    "#f59e0b",
  "Other":           "#4a7fa8",
};

function typeRgba(cls) {
  return TYPE_RGBA[(cls || "").toLowerCase()] ?? TYPE_RGBA.default;
}

export default function CosmosGPU() {
  const cosmoRef    = useRef(null);
  const [points, setPoints] = useState([]);
  const [links,  setLinks]  = useState([]);
  const [status, setStatus] = useState("Loading…");
  const [selected, setSelected] = useState(null);

  const fetchedRef  = useRef(new Set());
  const pointMapRef = useRef(new Map());
  const indexRef    = useRef(0);

  const addNeighbours = useCallback(async (uri, label, cls) => {
    if (fetchedRef.current.has(uri)) return;
    fetchedRef.current.add(uri);

    if (!pointMapRef.current.has(uri)) {
      const p = { id: uri, index: indexRef.current++, label: label || uri.split("#").pop().split("/").pop(), rgba: typeRgba(cls), size: 8 };
      pointMapRef.current.set(uri, p);
    }

    let data;
    try { data = await fetchNeighbours(uri); }
    catch { return; }

    const newPoints = [], newLinks = [];
    data.edges.slice(0, 16).forEach((e) => {
      if (!pointMapRef.current.has(e.target_uri)) {
        const p = { id: e.target_uri, index: indexRef.current++, label: e.target_label, rgba: typeRgba(e.target_class), size: 5 };
        pointMapRef.current.set(e.target_uri, p);
        newPoints.push(p);
      }
      newLinks.push({ source: uri, target: e.target_uri });
    });

    if (newPoints.length || newLinks.length) {
      setPoints((prev) => [...prev, ...newPoints]);
      setLinks((prev)  => [...prev, ...newLinks]);
    }
  }, []);

  useEffect(() => {
    async function seed() {
      let suggestions;
      try { suggestions = await fetchSuggestions(12); }
      catch { setStatus("Failed to load"); return; }

      const seedPoints = suggestions.map((s) => ({
        id: s.uri, index: indexRef.current++, label: s.label,
        rgba: typeRgba(s.type || s.class), size: 10,
      }));
      seedPoints.forEach((p) => pointMapRef.current.set(p.id, p));
      setPoints(seedPoints);
      setStatus(`${seedPoints.length} seed nodes — expanding…`);

      await Promise.all(suggestions.map((s) => addNeighbours(s.uri, s.label, s.type || s.class)));
      setStatus(`${pointMapRef.current.size} nodes — click to expand`);
    }
    seed();
  }, [addNeighbours]);

  const handlePointClick = useCallback(async (point) => {
    if (!point) return;
    setSelected(point);
    setStatus("Expanding…");
    await addNeighbours(point.id, point.label, null);
    setStatus(`${pointMapRef.current.size} nodes — click to expand`);
  }, [addNeighbours]);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#03050e", display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderBottom: "1px solid #0d1117", flexShrink: 0 }}>
        <span style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em" }}>MEMORIA</span>
        <span style={{ color: "#1e3347", fontSize: 13 }}>cosmos <span style={{ color: "#f59e0b", fontSize: 10 }}>GPU</span></span>
        <span style={{ marginLeft: "auto", color: "#1e3347", fontSize: 12 }}>{status}</span>
        {selected && (
          <span style={{ color: "#64748b", fontSize: 12, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected.label}
          </span>
        )}
        <Link to="/cosmos" style={{ color: "#1e3347", fontSize: 12, textDecoration: "none" }}>Canvas</Link>
        <Link to="/drift-demo" style={{ color: "#1e3347", fontSize: 12, textDecoration: "none" }}>Drift</Link>
        <Link to="/" style={{ color: "#1e3347", fontSize: 12, textDecoration: "none" }}>← Desktop</Link>
      </div>

      {/* Graph */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <Suspense fallback={
          <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#1e3347", fontSize: 13, letterSpacing: "0.1em" }}>
            Initialising WebGL renderer…
          </div>
        }>
          <Cosmograph
            ref={cosmoRef}
            style={{ width: "100%", height: "100%" }}
            points={points}
            links={links}
            pointIdBy="id"
            pointIndexBy="index"
            pointColorBy="rgba"
            pointSizeBy="size"
            pointSizeRange={[3, 14]}
            pointLabelBy="label"
            backgroundColor="#03050e"
            linkSourceBy="source"
            linkTargetBy="target"
            linkWidth={0.5}
            linkColor={[30, 60, 90, 120]}
            linkArrows={false}
            simulationGravity={0.05}
            simulationRepulsion={1.2}
            simulationLinkSpring={0.5}
            simulationLinkDistance={80}
            simulationFriction={0.8}
            showDynamicLabels={true}
            pointLabelFontSize={11}
            onPointClick={handlePointClick}
          />
        </Suspense>
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, padding: "8px 20px", flexWrap: "wrap", borderTop: "1px solid #0d1117", flexShrink: 0 }}>
        {Object.entries(TYPE_HEX).map(([label, color]) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#1e3347" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}
