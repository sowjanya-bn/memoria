/**
 * CosmosPage — Cosmograph-style GPU aesthetic using Canvas + d3-force.
 * Deep black void, glowing star nodes, hair-thin edges, live force sim.
 */
import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
} from "d3-force";
import { fetchSuggestions, fetchNeighbours } from "../api";

const BG       = "#03050e";
const TYPE_COLOR = {
  person:         "#1db954",
  artist:         "#1db954",
  musicgroup:     "#8b5cf6",
  band:           "#8b5cf6",
  event:          "#e05252",
  concert:        "#e05252",
  performance:    "#e05252",
  place:          "#38bdf8",
  stadium:        "#38bdf8",
  venue:          "#38bdf8",
  album:          "#a78bfa",
  musicalbum:     "#a78bfa",
  song:           "#2dd4bf",
  musicrecording: "#2dd4bf",
  organization:   "#f59e0b",
  default:        "#4a7fa8",
};
function typeColor(cls) {
  return TYPE_COLOR[(cls || "").toLowerCase()] ?? TYPE_COLOR.default;
}

const LEGEND = [
  ["Artist / Person", "#1db954"],
  ["Band / Group",    "#8b5cf6"],
  ["Event",           "#e05252"],
  ["Place / Venue",   "#38bdf8"],
  ["Album",           "#a78bfa"],
  ["Song",            "#2dd4bf"],
  ["Organisation",    "#f59e0b"],
  ["Other",           "#4a7fa8"],
];

export default function CosmosPage() {
  const canvasRef   = useRef(null);
  const simRef      = useRef(null);
  const nodesRef    = useRef([]);   // d3 node objects {id, label, color, r, x, y, vx, vy}
  const linksRef    = useRef([]);   // d3 link objects {source, target}
  const nodeMapRef  = useRef({});   // id → node
  const fetchedRef  = useRef(new Set());
  const rafRef      = useRef(null);
  const transformRef = useRef({ x: 0, y: 0, k: 1 }); // pan/zoom
  const dragRef     = useRef(null);
  const hoveredRef  = useRef(null);

  const [status,   setStatus]   = useState("Loading…");
  const [selected, setSelected] = useState(null);

  // ── Canvas draw ────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx   = canvas.getContext("2d");
    const { x: tx, y: ty, k } = transformRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    // Edges — hair-thin, near-invisible
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = "#1a3a5c";
    ctx.lineWidth   = 0.6;
    linksRef.current.forEach((l) => {
      const s = l.source, t = l.target;
      if (!s.x || !t.x) return;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // Nodes — glowing stars
    nodesRef.current.forEach((n) => {
      const isHovered = hoveredRef.current === n;
      const r = isHovered ? n.r * 1.6 : n.r;

      // outer glow
      ctx.save();
      ctx.shadowColor = n.color;
      ctx.shadowBlur  = isHovered ? 22 : 14;
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = n.color;
      ctx.globalAlpha = isHovered ? 0.95 : 0.75;
      ctx.fill();
      ctx.restore();

      // bright core
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = "#fff";
      ctx.globalAlpha = isHovered ? 0.9 : 0.55;
      ctx.fill();
      ctx.restore();

      // label on hover or zoom ≥ 0.9
      if (isHovered || k >= 0.9) {
        ctx.save();
        ctx.globalAlpha = isHovered ? 1 : Math.min(1, (k - 0.7) / 0.3);
        ctx.font = `${Math.round(10 / k)}px system-ui`;
        ctx.fillStyle = n.color;
        ctx.textAlign = "center";
        ctx.fillText(n.label, n.x, n.y + r + 11 / k);
        ctx.restore();
      }
    });

    ctx.restore();
  }, []);

  // ── Simulation ─────────────────────────────────────────────────────────
  const rebuildSim = useCallback((soft = false) => {
    if (soft && simRef.current) {
      // Just update nodes/links on existing sim — no alpha reset
      simRef.current
        .nodes(nodesRef.current)
        .force("link", forceLink(linksRef.current).id((d) => d.id).distance(90).strength(0.4));
      return;
    }

    if (simRef.current) simRef.current.stop();

    const canvas = canvasRef.current;
    const cx = canvas ? canvas.width  / 2 : 600;
    const cy = canvas ? canvas.height / 2 : 400;

    simRef.current = forceSimulation(nodesRef.current)
      .force("link",    forceLink(linksRef.current).id((d) => d.id).distance(90).strength(0.4))
      .force("charge",  forceManyBody().strength(-220))
      .force("center",  forceCenter(cx, cy).strength(0.04))
      .force("collide", forceCollide((d) => d.r + 4))
      .alphaDecay(0)        // never cool down
      .alphaMin(0)
      .alphaTarget(0.08)    // keep gently warm forever
      .velocityDecay(0.55)  // enough friction to not fly apart
      .on("tick", () => {
        // tiny random nudge per node each tick — makes it breathe
        nodesRef.current.forEach((n) => {
          if (n.fx == null) {
            n.vx += (Math.random() - 0.5) * 0.05;
            n.vy += (Math.random() - 0.5) * 0.05;
          }
        });
        draw();
      });
  }, [draw]);

  // ── Add neighbours ─────────────────────────────────────────────────────
  const addNeighbours = useCallback(async (uri, label, cls) => {
    if (fetchedRef.current.has(uri)) return;
    fetchedRef.current.add(uri);

    if (!nodeMapRef.current[uri]) {
      const n = { id: uri, label: label || uri.split("#").pop().split("/").pop(), color: typeColor(cls), r: 7 };
      nodesRef.current.push(n);
      nodeMapRef.current[uri] = n;
    }

    let data;
    try { data = await fetchNeighbours(uri); }
    catch { return; }

    let changed = false;
    data.edges.slice(0, 18).forEach((e) => {
      if (!nodeMapRef.current[e.target_uri]) {
        const n = { id: e.target_uri, label: e.target_label, color: typeColor(e.target_class), r: 5 };
        nodesRef.current.push(n);
        nodeMapRef.current[e.target_uri] = n;
        changed = true;
      }
      // avoid duplicate links
      const already = linksRef.current.some(
        (l) => (l.source.id ?? l.source) === uri && (l.target.id ?? l.target) === e.target_uri
      );
      if (!already) {
        linksRef.current.push({ source: uri, target: e.target_uri });
        changed = true;
      }
    });

    if (changed) rebuildSim(true);
  }, [rebuildSim]);

  // ── Seed ───────────────────────────────────────────────────────────────
  useEffect(() => {
    async function seed() {
      let suggestions;
      try { suggestions = await fetchSuggestions(14); }
      catch { setStatus("Failed to load"); return; }

      suggestions.forEach((s) => {
        if (!nodeMapRef.current[s.uri]) {
          const n = { id: s.uri, label: s.label, color: typeColor(s.type || s.class), r: 9 };
          nodesRef.current.push(n);
          nodeMapRef.current[s.uri] = n;
        }
      });
      rebuildSim();
      setStatus(`${nodesRef.current.length} nodes — expanding…`);

      await Promise.all(suggestions.map((s) => addNeighbours(s.uri, s.label, s.type || s.class)));
      setStatus(`${nodesRef.current.length} nodes — click to expand`);
    }
    seed();

    return () => {
      if (simRef.current) simRef.current.stop();
      cancelAnimationFrame(rafRef.current);
    };
  }, [rebuildSim, addNeighbours]);

  // ── Resize canvas ──────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ro = new ResizeObserver(() => {
      canvas.width  = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
      draw();
    });
    ro.observe(canvas);
    canvas.width  = canvas.offsetWidth;
    canvas.height = canvas.offsetHeight;
    return () => ro.disconnect();
  }, [draw]);

  // ── Pointer helpers ────────────────────────────────────────────────────
  function toWorld(cx, cy) {
    const { x, y, k } = transformRef.current;
    return { wx: (cx - x) / k, wy: (cy - y) / k };
  }
  function nodeAt(cx, cy) {
    const { wx, wy } = toWorld(cx, cy);
    return nodesRef.current.find((n) => Math.hypot(n.x - wx, n.y - wy) < n.r + 6);
  }

  // ── Mouse events ───────────────────────────────────────────────────────
  function onMouseMove(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;

    if (dragRef.current) {
      if (dragRef.current.node) {
        const { wx, wy } = toWorld(cx, cy);
        dragRef.current.node.fx = wx;
        dragRef.current.node.fy = wy;
        simRef.current?.alpha(0.3).restart();
      } else {
        transformRef.current.x += e.movementX;
        transformRef.current.y += e.movementY;
        draw();
      }
      return;
    }
    const hit = nodeAt(cx, cy);
    if (hit !== hoveredRef.current) {
      hoveredRef.current = hit;
      canvasRef.current.style.cursor = hit ? "pointer" : "grab";
      draw();
    }
  }

  function onMouseDown(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const hit = nodeAt(cx, cy);
    dragRef.current = { node: hit || null };
    if (!hit) canvasRef.current.style.cursor = "grabbing";
  }

  async function onMouseUp(e) {
    const wasDrag = dragRef.current?.node;
    if (wasDrag) { wasDrag.fx = null; wasDrag.fy = null; }
    dragRef.current = null;
    canvasRef.current.style.cursor = "grab";

    if (!wasDrag) {
      const rect = canvasRef.current.getBoundingClientRect();
      const hit = nodeAt(e.clientX - rect.left, e.clientY - rect.top);
      if (hit) {
        setSelected(hit);
        setStatus("Expanding…");
        await addNeighbours(hit.id, hit.label, null);
        setStatus(`${nodesRef.current.length} nodes — click to expand`);
      }
    }
  }

  function onWheel(e) {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.1 : 0.91;
    const t = transformRef.current;
    t.x = cx - (cx - t.x) * factor;
    t.y = cy - (cy - t.y) * factor;
    t.k = Math.max(0.05, Math.min(6, t.k * factor));
    draw();
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderBottom: "1px solid #0d1117", flexShrink: 0 }}>
        <span style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em" }}>MEMORIA</span>
        <span style={{ color: "#1e3347", fontSize: 13 }}>cosmos</span>
        <span style={{ marginLeft: "auto", color: "#1e3347", fontSize: 12 }}>{status}</span>
        {selected && (
          <span style={{ color: "#64748b", fontSize: 12, maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected.label}
          </span>
        )}
        <Link to="/cosmos-gpu" style={{ color: "#f59e0b", fontSize: 12, textDecoration: "none" }}>GPU ✦</Link>
        <Link to="/explore" style={{ color: "#38bdf8", fontSize: 12, textDecoration: "none" }}>Explorer</Link>
        <Link to="/" style={{ color: "#1e3347", fontSize: 12, textDecoration: "none" }}>← Desktop</Link>
        <Link to="/drift-demo" style={{ color: "#1e3347", fontSize: 12, textDecoration: "none" }}>Drift</Link>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{ flex: 1, minHeight: 0, display: "block", cursor: "grab" }}
        onMouseMove={onMouseMove}
        onMouseDown={onMouseDown}
        onMouseUp={onMouseUp}
        onWheel={onWheel}
      />

      {/* Legend */}
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
