/**
 * Installation canvas — radial layout with SVG edges and DOM dwell nodes.
 */
import { useRef, useState, useEffect } from "react";
import DwellNode from "./DwellNode";

const MAX_PRIMARY = 8;
const RING_RADIUS = 260;

export default function InstallationCanvas({ scene, onNavigate, onGroupedExpand, disabled }) {
  const canvasRef = useRef(null);
  const [dims, setDims] = useState({ w: 0, h: 0 });

  // Track canvas size for SVG centre calculation
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setDims({ w: el.offsetWidth, h: el.offsetHeight });
    });
    ro.observe(el);
    setDims({ w: el.offsetWidth, h: el.offsetHeight });
    return () => ro.disconnect();
  }, []);

  if (!scene?.focal_uri) return <div className="inst-canvas" ref={canvasRef} />;

  const primaries = scene.primary_edges.slice(0, MAX_PRIMARY);
  const handles = scene.grouped_handles;
  const ringItems = [
    ...primaries.map((e) => ({ type: "primary", ...e })),
    ...handles.map((h) => ({ type: "grouped", ...h })),
  ];

  const cx = dims.w / 2;
  const cy = dims.h / 2;
  const total = ringItems.length || 1;

  const positions = ringItems.map((_, i) => {
    const angle = (2 * Math.PI * i) / total - Math.PI / 2;
    return {
      x: cx + Math.cos(angle) * RING_RADIUS,
      y: cy + Math.sin(angle) * RING_RADIUS,
    };
  });

  return (
    <div className="inst-canvas" ref={canvasRef}>
      {/* SVG edge layer */}
      <svg
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        <defs>
          <marker id="arrowhead" markerWidth="8" markerHeight="6" refX="8" refY="3" orient="auto">
            <polygon points="0 0, 8 3, 0 6" fill="#334155" />
          </marker>
        </defs>
        {positions.map((pos, i) => {
          // Shorten line so it doesn't overlap node circles
          const dx = pos.x - cx;
          const dy = pos.y - cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const focalR = 65;
          const targetR = ringItems[i].type === "grouped" ? 52 : 46;
          const x1 = cx + (dx / dist) * focalR;
          const y1 = cy + (dy / dist) * focalR;
          const x2 = pos.x - (dx / dist) * targetR;
          const y2 = pos.y - (dy / dist) * targetR;

          return (
            <g key={i}>
              <line
                x1={x1} y1={y1} x2={x2} y2={y2}
                stroke="#1e3a5f"
                strokeWidth={2}
                markerEnd="url(#arrowhead)"
              />
              {/* Predicate label on edge */}
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 5}
                fill="#334155"
                fontSize="10"
                textAnchor="middle"
                dominantBaseline="middle"
              >
                {ringItems[i].type === "primary"
                  ? ringItems[i].predicate_label
                  : ringItems[i].predicate_label}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Focal node */}
      <div className="inst-focal-wrap">
        <DwellNode label={scene.label} cls={scene.class} isFocal disabled={disabled} />
        {scene.streaming && <div className="inst-stream-dot" />}
      </div>

      {/* Ring nodes */}
      {ringItems.map((item, i) => {
        const pos = positions[i];
        if (!pos) return null;
        return (
          <div
            key={item.type === "primary" ? item.target_uri : `grouped-${i}`}
            className="inst-ring-node"
            style={{
              position: "absolute",
              left: pos.x,
              top: pos.y,
              transform: "translate(-50%, -50%)",
            }}
          >
            {item.type === "primary" ? (
              <DwellNode
                label={item.target_label}
                cls={item.target_class}
                disabled={disabled}
                onSelect={() => onNavigate(item.target_uri)}
              />
            ) : (
              <DwellNode
                label={item.predicate_label}
                cls={item.member_class}
                isGrouped
                count={item.count}
                disabled={disabled}
                onSelect={() => onGroupedExpand(item)}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
