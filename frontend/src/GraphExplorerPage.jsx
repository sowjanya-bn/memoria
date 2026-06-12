/**
 * GraphExplorerPage — split-panel graph explorer.
 * Left: d3-force canvas overview of the full graph (pan/zoom/expand).
 * Right: Cytoscape subgraph detail panel for the selected node, navigable.
 * Route: /explore
 */
import { useEffect, useRef, useState, useCallback } from "react";
import {
  forceSimulation, forceLink, forceManyBody, forceCenter, forceCollide,
} from "d3-force";
import { fetchSuggestions, fetchNeighbours } from "./api";
import { useScene } from "./useScene";
import GraphCanvas from "./GraphCanvas";
import { useTypeColors } from "./useTypeColors";

const BG = "#03050e";

export default function GraphExplorerPage() {
  const { colorForType: typeColor, legend: LEGEND, mapRef: typeMapRef } = useTypeColors();
  // ── Overview canvas refs ────────────────────────────────────────────────
  const canvasRef     = useRef(null);
  const simRef        = useRef(null);
  const nodesRef      = useRef([]);
  const linksRef      = useRef([]);
  const nodeMapRef    = useRef({});
  const fetchedRef    = useRef(new Set());
  const transformRef  = useRef({ x: 0, y: 0, k: 1 });
  const dragRef       = useRef(null);
  const hoveredRef    = useRef(null);
  const selectedRef   = useRef(null); // highlighted node in overview
  const neighboursRef = useRef(new Set()); // ids of neighbours of selected node

  const [status, setStatus]             = useState("Loading…");
  const [selectedNode, setSelectedNode] = useState(null);
  const [panelPos, setPanelPos]         = useState({ x: 0, y: 0 }); // screen coords

  const PANEL_W = 400;
  const PANEL_H = 520;
  const PANEL_W_MINI = Math.round(PANEL_W * 0.4);
  const PANEL_H_MINI = Math.round(PANEL_H * 0.4);
  const [panelHovered, setPanelHovered] = useState(false);
  const panelDragRef = useRef(null);

  // ── Detail panel ────────────────────────────────────────────────────────
  const { scene, loading, navigate: navigateScene, mergeExpanded, reset: resetScene } = useScene();
  const [detailBreadcrumb, setDetailBreadcrumb] = useState([]);

  // ── Canvas draw ─────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { x: tx, y: ty, k } = transformRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(k, k);

    const sel      = selectedRef.current;
    const nbrs     = neighboursRef.current;
    const hasFocus = !!sel;

    // Edges
    linksRef.current.forEach((l) => {
      const s = l.source, t = l.target;
      if (!s.x || !t.x) return;
      const sid = s.id ?? s;
      const tid = t.id ?? t;
      const isNeighbourEdge = hasFocus && sel &&
        ((sid === sel.id && nbrs.has(tid)) || (tid === sel.id && nbrs.has(sid)));
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(t.x, t.y);
      if (hasFocus) {
        if (isNeighbourEdge) {
          ctx.globalAlpha = 0.7;
          ctx.strokeStyle = "#38bdf8";
          ctx.lineWidth   = 1.2;
        } else {
          ctx.globalAlpha = 0.04;
          ctx.strokeStyle = "#1a3a5c";
          ctx.lineWidth   = 0.6;
        }
      } else {
        ctx.globalAlpha = 0.18;
        ctx.strokeStyle = "#1a3a5c";
        ctx.lineWidth   = 0.6;
      }
      ctx.stroke();
      ctx.restore();
    });

    // Nodes
    nodesRef.current.forEach((n) => {
      const isHovered   = hoveredRef.current === n;
      const isSelected  = sel === n;
      const isNeighbour = hasFocus && nbrs.has(n.id);
      const isDimmed    = hasFocus && !isSelected && !isNeighbour;
      const r = isHovered ? n.r * 1.6 : (isNeighbour ? n.r * 1.1 : n.r);

      // Selection ring
      if (isSelected) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 6, 0, Math.PI * 2);
        ctx.strokeStyle = "#f59e0b";
        ctx.lineWidth   = 2 / k;
        ctx.globalAlpha = 0.9;
        ctx.stroke();
        ctx.restore();
      }

      // Neighbour ring
      if (isNeighbour) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3, 0, Math.PI * 2);
        ctx.strokeStyle = "#38bdf8";
        ctx.lineWidth   = 1 / k;
        ctx.globalAlpha = 0.6;
        ctx.stroke();
        ctx.restore();
      }

      // Glow
      ctx.save();
      ctx.shadowColor = n.color;
      ctx.shadowBlur  = isHovered ? 22 : (isNeighbour ? 18 : 14);
      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle   = n.color;
      ctx.globalAlpha = isDimmed ? 0.08 : (isHovered ? 0.95 : 0.75);
      ctx.fill();
      ctx.restore();

      // Core
      ctx.save();
      ctx.beginPath();
      ctx.arc(n.x, n.y, r * 0.45, 0, Math.PI * 2);
      ctx.fillStyle   = "#fff";
      ctx.globalAlpha = isDimmed ? 0.04 : (isHovered ? 0.9 : 0.55);
      ctx.fill();
      ctx.restore();

      // Label
      const showLabel = isHovered || isSelected || isNeighbour || (!hasFocus && k >= 0.9);
      if (showLabel) {
        ctx.save();
        ctx.globalAlpha = (isHovered || isSelected || isNeighbour) ? 1 : Math.min(1, (k - 0.7) / 0.3);
        ctx.font        = `${Math.round(10 / k)}px system-ui`;
        ctx.fillStyle   = isSelected ? "#f59e0b" : (isNeighbour ? "#38bdf8" : n.color);
        ctx.textAlign   = "center";
        ctx.fillText(n.label, n.x, n.y + r + 11 / k);
        ctx.restore();
      }
    });

    ctx.restore();
  }, []);

  // ── Simulation ──────────────────────────────────────────────────────────
  const rebuildSim = useCallback((soft = false) => {
    if (soft && simRef.current) {
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
      .alphaDecay(0)
      .alphaMin(0)
      .alphaTarget(0.08)
      .velocityDecay(0.55)
      .on("tick", () => {
        nodesRef.current.forEach((n) => {
          if (n.fx == null) {
            n.vx += (Math.random() - 0.5) * 0.05;
            n.vy += (Math.random() - 0.5) * 0.05;
          }
        });
        draw();
      });
  }, [draw]);

  // ── Add neighbours ──────────────────────────────────────────────────────
  const addNeighbours = useCallback(async (uri, label, cls) => {
    if (fetchedRef.current.has(uri)) return;
    fetchedRef.current.add(uri);
    if (!nodeMapRef.current[uri]) {
      const n = { id: uri, label: label || uri.split("#").pop().split("/").pop(), color: typeColor(cls), cls, r: 7 };
      nodesRef.current.push(n);
      nodeMapRef.current[uri] = n;
    }
    let data;
    try { data = await fetchNeighbours(uri); }
    catch { return; }
    let changed = false;
    data.edges.slice(0, 18).forEach((e) => {
      if (!nodeMapRef.current[e.target_uri]) {
        const n = { id: e.target_uri, label: e.target_label, color: typeColor(e.target_class), cls: e.target_class, r: 5 };
        nodesRef.current.push(n);
        nodeMapRef.current[e.target_uri] = n;
        changed = true;
      }
      const already = linksRef.current.some(
        (l) => (l.source.id ?? l.source) === uri && (l.target.id ?? l.target) === e.target_uri
      );
      if (!already) { linksRef.current.push({ source: uri, target: e.target_uri }); changed = true; }
    });
    if (changed) rebuildSim(true);
  }, [rebuildSim]);

  // ── Seed ────────────────────────────────────────────────────────────────
  useEffect(() => {
    async function seed() {
      let suggestions;
      try { suggestions = await fetchSuggestions(100); }
      catch { setStatus("Failed to load"); return; }
      suggestions.forEach((s) => {
        if (!nodeMapRef.current[s.uri]) {
          const cls = s.class || s.type || (s.classes && s.classes[0]?.split("#").pop().split("/").pop()) || "";
          const n = { id: s.uri, label: s.label, color: typeColor(cls), cls, r: 9 };
          nodesRef.current.push(n);
          nodeMapRef.current[s.uri] = n;
        }
      });
      rebuildSim();
      setStatus(`${nodesRef.current.length} nodes — click to explore`);
      await Promise.all(suggestions.map((s) => addNeighbours(s.uri, s.label, s.class || s.type || (s.classes && s.classes[0]?.split("#").pop().split("/").pop()) || "")));
      setStatus(`${nodesRef.current.length} nodes — click to explore`);
    }
    seed();
    return () => {
      if (simRef.current) simRef.current.stop();
    };
  }, [rebuildSim, addNeighbours]);

  // Re-color all nodes once the type map arrives
  useEffect(() => {
    if (!typeMapRef || Object.keys(typeMapRef.current).length === 0) return;
    console.log("[typeColors] recoloring", nodesRef.current.length, "nodes, map:", typeMapRef.current);
    nodesRef.current.forEach((n) => {
      const c = typeColor(n.cls);
      console.log("[typeColors]", n.label, n.cls, "→", c);
      n.color = c;
    });
    draw();
  }, [LEGEND]);

  // ── Resize ──────────────────────────────────────────────────────────────
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

  // ── Pointer helpers ─────────────────────────────────────────────────────
  function toWorld(cx, cy) {
    const { x, y, k } = transformRef.current;
    return { wx: (cx - x) / k, wy: (cy - y) / k };
  }
  function nodeAt(cx, cy) {
    const { wx, wy } = toWorld(cx, cy);
    return nodesRef.current.find((n) => Math.hypot(n.x - wx, n.y - wy) < n.r + 6);
  }

  // ── Mouse events ─────────────────────────────────────────────────────────
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
    dragRef.current = { node: hit || null, startX: cx, startY: cy };
    if (!hit) canvasRef.current.style.cursor = "grabbing";
  }

  async function onMouseUp(e) {
    const drag = dragRef.current;
    if (drag?.node) { drag.node.fx = null; drag.node.fy = null; }
    dragRef.current = null;
    canvasRef.current.style.cursor = "grab";

    // Only treat as click if pointer barely moved
    const rect = canvasRef.current.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const moved = drag ? Math.hypot(cx - drag.startX, cy - drag.startY) : 0;
    if (moved > 5) return;

    const hit = nodeAt(cx, cy);
    if (!hit) {
      if (scene) {
        selectedRef.current = null;
        neighboursRef.current = new Set();
        setSelectedNode(null);
        setDetailBreadcrumb([]);
        resetScene();
        draw();
      }
      return;
    }
    if (hit) {
      selectedRef.current = hit;
      // Compute immediate neighbours from current links
      const nbrs = new Set();
      linksRef.current.forEach((l) => {
        const sid = l.source.id ?? l.source;
        const tid = l.target.id ?? l.target;
        if (sid === hit.id) nbrs.add(tid);
        if (tid === hit.id) nbrs.add(sid);
      });
      neighboursRef.current = nbrs;
      setSelectedNode(hit);
      setDetailBreadcrumb([]);

      // Animate pan to center the clicked node — pause sim during animation
      const canvas = canvasRef.current;
      const { k } = transformRef.current;
      const targetX = canvas.width  / 2 - hit.x * k;
      const targetY = canvas.height / 2 - hit.y * k;
      const startX = transformRef.current.x;
      const startY = transformRef.current.y;
      const duration = 600;
      const startTime = performance.now();
      const ease = (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
      simRef.current?.stop();
      const animatePan = (now) => {
        const t = Math.min(1, (now - startTime) / duration);
        const e = ease(t);
        transformRef.current.x = startX + (targetX - startX) * e;
        transformRef.current.y = startY + (targetY - startY) * e;
        draw();
        if (t < 1) requestAnimationFrame(animatePan);
        else simRef.current?.restart();
      };
      requestAnimationFrame(animatePan);

      // Panel goes top-right of screen center (where node lands after animation)
      const sx = canvas.width  / 2;
      const sy = canvas.height / 2;
      const maxX = canvas.width  - PANEL_W_MINI - 12;
      const maxY = canvas.height - PANEL_H_MINI - 12;
      setPanelPos({
        x: Math.max(8, Math.min(maxX, sx + 120)),
        y: Math.max(8, Math.min(maxY, sy - PANEL_H_MINI + 40)),
      });
      setPanelHovered(false);

      setStatus("Loading subgraph…");
      navigateScene(hit.id);
      await addNeighbours(hit.id, hit.label, null);
      setStatus(`${nodesRef.current.length} nodes — click to explore`);
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

  // ── Detail panel node interactions ──────────────────────────────────────
  const handleDetailNodeClick = useCallback((uri) => {
    if (scene) {
      setDetailBreadcrumb((prev) => [...prev, { uri: scene.focal_uri, label: scene.label }]);
    }
    navigateScene(uri);
    // Also highlight matching node in overview if it exists
    const overviewNode = nodeMapRef.current[uri];
    if (overviewNode) {
      selectedRef.current = overviewNode;
      setSelectedNode(overviewNode);
      draw();
    }
  }, [scene, navigateScene, draw]);

  const handleDetailExpand = useCallback(async (uri) => {
    try {
      const result = await fetchNeighbours(uri);
      mergeExpanded(uri, result.edges);
      // Also grow the overview
      addNeighbours(uri, null, null);
    } catch (e) {
      console.error("Expand failed:", e);
    }
  }, [mergeExpanded, addNeighbours]);

  const handleDetailBreadcrumbBack = () => {
    if (detailBreadcrumb.length === 0) return;
    const prev = detailBreadcrumb[detailBreadcrumb.length - 1];
    setDetailBreadcrumb((b) => b.slice(0, -1));
    navigateScene(prev.uri);
    const overviewNode = nodeMapRef.current[prev.uri];
    if (overviewNode) { selectedRef.current = overviewNode; setSelectedNode(overviewNode); draw(); }
  };

  function exportHTML() {
    const nodes = nodesRef.current.map((n) => ({ id: n.id, label: n.label, color: n.color, r: n.r, x: n.x, y: n.y }));
    const links = linksRef.current.map((l) => ({ source: l.source.id ?? l.source, target: l.target.id ?? l.target }));
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>Memoria — Graph Export</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#03050e;overflow:hidden}canvas{display:block}</style>
</head>
<body>
<canvas id="c"></canvas>
<script>
const NODES = ${JSON.stringify(nodes)};
const LINKS = ${JSON.stringify(links)};

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
window.addEventListener('resize', () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; draw(); });

// Build node map
const nm = {};
NODES.forEach(n => nm[n.id] = n);
// Resolve links
const links = LINKS.map(l => ({ source: nm[l.source], target: nm[l.target] })).filter(l => l.source && l.target);

let tx = 0, ty = 0, k = 1;
// Center on current node positions
const xs = NODES.map(n=>n.x), ys = NODES.map(n=>n.y);
const cx = (Math.min(...xs)+Math.max(...xs))/2, cy = (Math.min(...ys)+Math.max(...ys))/2;
tx = canvas.width/2 - cx; ty = canvas.height/2 - cy;

let hovered = null, selected = null, drag = null;

// Precompute neighbour sets
const nbMap = {};
NODES.forEach(n => nbMap[n.id] = new Set());
links.forEach(l => { nbMap[l.source.id]?.add(l.target.id); nbMap[l.target.id]?.add(l.source.id); });

function toWorld(px,py){ return {wx:(px-tx)/k, wy:(py-ty)/k}; }
function nodeAt(px,py){ const {wx,wy}=toWorld(px,py); return NODES.find(n=>Math.hypot(n.x-wx,n.y-wy)<n.r+6); }

function draw() {
  ctx.clearRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle='#03050e'; ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.save(); ctx.translate(tx,ty); ctx.scale(k,k);
  const focus = selected || hovered;
  const nbrs = focus ? nbMap[focus.id] : null;
  links.forEach(l => {
    if(!l.source.x||!l.target.x) return;
    const isNb = focus && (nbMap[focus.id]?.has(l.source.id) && l.target===focus || nbMap[focus.id]?.has(l.target.id) && l.source===focus
      || l.source===focus || l.target===focus);
    ctx.save(); ctx.beginPath(); ctx.moveTo(l.source.x,l.source.y); ctx.lineTo(l.target.x,l.target.y);
    ctx.globalAlpha = focus ? (isNb?0.7:0.04) : 0.18;
    ctx.strokeStyle = isNb ? '#38bdf8' : '#1a3a5c';
    ctx.lineWidth = isNb ? 1.2 : 0.6; ctx.stroke(); ctx.restore();
  });
  ctx.globalAlpha=1;
  NODES.forEach(n => {
    const isH=hovered===n, isSel=selected===n, isNb=nbrs?.has(n.id), isDim=focus&&!isSel&&!isNb;
    const r = isH ? n.r*1.6 : isNb ? n.r*1.1 : n.r;
    if(isSel){ ctx.save(); ctx.beginPath(); ctx.arc(n.x,n.y,r+6,0,Math.PI*2);
      ctx.strokeStyle='#f59e0b'; ctx.lineWidth=2/k; ctx.globalAlpha=0.9; ctx.stroke(); ctx.restore(); }
    if(isNb){ ctx.save(); ctx.beginPath(); ctx.arc(n.x,n.y,r+3,0,Math.PI*2);
      ctx.strokeStyle='#38bdf8'; ctx.lineWidth=1/k; ctx.globalAlpha=0.6; ctx.stroke(); ctx.restore(); }
    ctx.save(); ctx.shadowColor=n.color; ctx.shadowBlur=isH?22:isNb?18:14;
    ctx.beginPath(); ctx.arc(n.x,n.y,r,0,Math.PI*2);
    ctx.fillStyle=n.color; ctx.globalAlpha=isDim?0.08:isH?0.95:0.75; ctx.fill(); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.arc(n.x,n.y,r*0.45,0,Math.PI*2);
    ctx.fillStyle='#fff'; ctx.globalAlpha=isDim?0.04:isH?0.9:0.55; ctx.fill(); ctx.restore();
    if(isH||isSel||isNb||(!focus&&k>=0.9)){
      ctx.save(); ctx.globalAlpha=(isH||isSel||isNb)?1:Math.min(1,(k-0.7)/0.3);
      ctx.font=Math.round(10/k)+'px system-ui';
      ctx.fillStyle=isSel?'#f59e0b':isNb?'#38bdf8':n.color; ctx.textAlign='center';
      ctx.fillText(n.label,n.x,n.y+r+11/k); ctx.restore(); }
  });
  ctx.restore();
}

canvas.addEventListener('mousemove', e => {
  if(drag){ if(drag.node){drag.node.x=(e.clientX-tx)/k;drag.node.y=(e.clientY-ty)/k;}
    else{tx+=e.movementX;ty+=e.movementY;} draw(); return; }
  const h=nodeAt(e.clientX,e.clientY);
  if(h!==hovered){hovered=h;canvas.style.cursor=h?'pointer':'grab';draw();}
});
canvas.addEventListener('mousedown', e => { drag={node:nodeAt(e.clientX,e.clientY)||null,sx:e.clientX,sy:e.clientY}; if(!drag.node)canvas.style.cursor='grabbing'; });
canvas.addEventListener('mouseup', e => {
  const moved = drag ? Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy) : 0;
  drag=null; canvas.style.cursor='grab';
  if(moved>5) return;
  const hit=nodeAt(e.clientX,e.clientY);
  selected = hit===selected ? null : hit; draw();
});
canvas.addEventListener('wheel', e => {
  e.preventDefault();
  const f=e.deltaY<0?1.1:0.91;
  tx=e.clientX-(e.clientX-tx)*f; ty=e.clientY-(e.clientY-ty)*f;
  k=Math.max(0.05,Math.min(6,k*f)); draw();
}, {passive:false});

canvas.style.cursor='grab';
draw();
<\/script>
</body>
</html>`;
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "memoria-graph.html";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div style={{ position: "fixed", inset: 0, background: BG, display: "flex", flexDirection: "column", fontFamily: "system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "10px 20px", borderBottom: "1px solid #0d1117", flexShrink: 0 }}>
        <span style={{ color: "#8b5cf6", fontWeight: 700, fontSize: 15, letterSpacing: "0.08em" }}>MEMORIA</span>
        <span style={{ color: "#1e3347", fontSize: 13 }}>explorer</span>
        <span style={{ marginLeft: "auto", color: "#1e3347", fontSize: 12 }}>{status}{loading ? " ·" : ""}</span>
        {selectedNode && (
          <span style={{ color: "#f59e0b", fontSize: 12, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selectedNode.label}
          </span>
        )}
        <button onClick={exportHTML} style={{ background: "none", border: "1px solid #1e3347", color: "#475569", fontSize: 11, padding: "3px 10px", borderRadius: 4, cursor: "pointer" }}>Export HTML</button>
      </div>

      {/* Main area — canvas + floating panel overlay */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "grab" }}
          onMouseMove={onMouseMove}
          onMouseDown={onMouseDown}
          onMouseUp={onMouseUp}
          onWheel={onWheel}
        />

        {/* Floating detail panel — mini by default, expands on hover */}
        {scene && (
          <div
            onMouseEnter={() => setPanelHovered(true)}
            onMouseLeave={() => setPanelHovered(false)}
            style={{
              position: "absolute",
              left: panelPos.x,
              top: panelPos.y,
              width: PANEL_W,
              height: PANEL_H,
              transformOrigin: "top left",
              transform: `scale(${panelHovered ? 1 : 0.4})`,
              transition: "transform 0.15s ease",
              background: "rgba(4, 8, 16, 0.92)",
              border: "1px solid #1e3347",
              borderRadius: 8,
              boxShadow: "0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(139,92,246,0.15)",
              display: "flex",
              flexDirection: "column",
              backdropFilter: "blur(8px)",
              zIndex: 10,
              overflow: "hidden",
              cursor: panelHovered ? "default" : "pointer",
            }}
          >
            {/* Drag handle */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                panelDragRef.current = { startX: e.clientX - panelPos.x, startY: e.clientY - panelPos.y };
                const onMove = (ev) => {
                  if (!panelDragRef.current) return;
                  setPanelPos({ x: ev.clientX - panelDragRef.current.startX, y: ev.clientY - panelDragRef.current.startY });
                };
                const onUp = () => {
                  panelDragRef.current = null;
                  window.removeEventListener("mousemove", onMove);
                  window.removeEventListener("mouseup", onUp);
                };
                window.addEventListener("mousemove", onMove);
                window.addEventListener("mouseup", onUp);
              }}
              style={{ height: 6, flexShrink: 0, cursor: "grab", display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <span style={{ width: 24, height: 2, borderRadius: 1, background: "#1e3347" }} />
            </div>

            {/* Breadcrumb — only visible when expanded */}
            {panelHovered && detailBreadcrumb.length > 0 && (
              <div style={{ padding: "4px 14px", display: "flex", gap: 6, flexWrap: "wrap", flexShrink: 0, borderBottom: "1px solid #0d1117" }}>
                {detailBreadcrumb.map((b, i) => (
                  <span key={b.uri} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <button
                      onClick={() => {
                        setDetailBreadcrumb((prev) => prev.slice(0, i));
                        navigateScene(b.uri);
                        const ov = nodeMapRef.current[b.uri];
                        if (ov) { selectedRef.current = ov; setSelectedNode(ov); draw(); }
                      }}
                      style={{ background: "none", border: "none", color: "#475569", fontSize: 11, cursor: "pointer", padding: 0 }}
                    >{b.label}</button>
                    {i < detailBreadcrumb.length - 1 && <span style={{ color: "#1e3347", fontSize: 11 }}>›</span>}
                  </span>
                ))}
                <span style={{ color: "#1e3347", fontSize: 11 }}>›</span>
              </div>
            )}

            {/* Single GraphCanvas — always mounted, never remounts */}
            <div style={{ flex: 1, minHeight: 0, overflow: "hidden" }}>
              <GraphCanvas
                scene={scene}
                onNodeClick={panelHovered ? handleDetailNodeClick : () => {}}
                onNodeExpand={panelHovered ? handleDetailExpand : () => {}}
                onGroupedClick={() => {}}
                streaming={scene?.streaming}
              />
            </div>
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", gap: 14, padding: "8px 20px", flexWrap: "wrap", borderTop: "1px solid #0d1117", flexShrink: 0 }}>
        {LEGEND.map(([label, color]) => (
          <span key={label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#1e3347" }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: color, boxShadow: `0 0 5px ${color}`, flexShrink: 0 }} />
            {label}
          </span>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#1e3347" }}>
          click node to explore subgraph · drag to pan · scroll to zoom
        </span>
      </div>
    </div>
  );
}
