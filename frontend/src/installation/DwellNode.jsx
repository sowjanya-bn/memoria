/**
 * A large touch/gesture-safe node with dwell-select.
 * Hovering for DWELL_MS triggers onSelect automatically.
 */
import { useRef, useState, useCallback } from "react";

const DWELL_MS = 1000;

const CLASS_COLORS = {
  MusicGroup:       "#7c3aed",
  MusicEnsemble:    "#7c3aed",
  Person:           "#0891b2",
  MusicEvent:       "#dc2626",
  LivePerformance:  "#ea580c",
  MusicVenue:       "#16a34a",
  ItemList:         "#ca8a04",
  MusicGenre:       "#db2777",
  MusicEntity:      "#4f46e5",
  default:          "#334155",
};

function nodeColor(cls) {
  return CLASS_COLORS[cls] || CLASS_COLORS.default;
}

export default function DwellNode({ label, cls, isFocal, isGrouped, count, onSelect, disabled }) {
  const [dwellProgress, setDwellProgress] = useState(0); // 0–1
  const rafRef = useRef(null);
  const startRef = useRef(null);

  const startDwell = useCallback(() => {
    if (disabled) return;
    startRef.current = performance.now();
    const tick = () => {
      const elapsed = performance.now() - startRef.current;
      const progress = Math.min(elapsed / DWELL_MS, 1);
      setDwellProgress(progress);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onSelect?.();
      }
    };
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, onSelect]);

  const cancelDwell = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    setDwellProgress(0);
    startRef.current = null;
  }, []);

  const size = isFocal ? 130 : isGrouped ? 100 : 90;
  const color = isFocal ? "#f59e0b" : nodeColor(cls);
  const circumference = Math.PI * 2 * (size / 2 - 6);
  const strokeDash = circumference * dwellProgress;

  return (
    <div
      className={`dwell-node${isFocal ? " focal" : ""}${isGrouped ? " grouped" : ""}${disabled ? " disabled" : ""}`}
      style={{ width: size, height: size }}
      onMouseEnter={startDwell}
      onMouseLeave={cancelDwell}
      onTouchStart={(e) => { e.preventDefault(); startDwell(); }}
      onTouchEnd={cancelDwell}
    >
      <svg width={size} height={size} style={{ position: "absolute", top: 0, left: 0 }}>
        <circle
          cx={size / 2} cy={size / 2} r={size / 2 - 6}
          fill={color}
          fillOpacity={isFocal ? 1 : 0.85}
          stroke={color}
          strokeWidth={2}
        />
        {/* Dwell progress ring */}
        {dwellProgress > 0 && (
          <circle
            cx={size / 2} cy={size / 2} r={size / 2 - 6}
            fill="none"
            stroke="#fff"
            strokeWidth={4}
            strokeOpacity={0.9}
            strokeDasharray={`${strokeDash} ${circumference}`}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        )}
      </svg>

      <div className="dwell-label">
        {isGrouped ? (
          <>
            <span className="dwell-group-pred">{label}</span>
            <span className="dwell-group-count">{count}</span>
          </>
        ) : (
          <span>{label}</span>
        )}
      </div>
    </div>
  );
}
