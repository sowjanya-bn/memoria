/**
 * Fetches KG types from the backend and assigns a stable color palette.
 * Returns { colorForType(cls), legend, loading }
 */
import { useEffect, useRef, useState } from "react";
import { fetchTypes } from "./api";

const DEFAULT_COLOR = "#4a7fa8";

function buildPalette(n) {
  return Array.from({ length: n }, (_, i) => {
    const h = Math.round((i / n) * 360);
    return `hsl(${h}, 70%, 62%)`;
  });
}

let _cache = null;

export function useTypeColors() {
  const mapRef = useRef(_cache || {}); // ref so closures always see latest map
  const [legend, setLegend] = useState([]);

  useEffect(() => {
    if (_cache) { mapRef.current = _cache; return; }
    fetchTypes()
      .then((types) => {
        console.log("[useTypeColors] fetched", types.length, "types:", types.map(t => t.type));
        const palette = buildPalette(types.length);
        const map = {};
        types.forEach(({ type }, i) => {
          map[type.toLowerCase()] = palette[i];
        });
        _cache = map;
        mapRef.current = map;
        setLegend(types.slice(0, 16).map(({ type }, i) => [type, palette[i]]));
      })
      .catch((e) => console.error("[useTypeColors] fetch failed", e));
  }, []);

  // Stable function — reads from ref, never stale inside draw closures
  const colorForType = (cls) => {
    if (!cls) return DEFAULT_COLOR;
    return mapRef.current[(cls || "").toLowerCase()] ?? DEFAULT_COLOR;
  };

  return { colorForType, legend, mapRef };
}
