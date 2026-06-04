import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";
import cytoscape from "cytoscape";
import { fetchNeighbours } from "../api";
import FlowCanvas from "./FlowCanvas";

const RING_RADIUS   = 240;
const BG            = "#03050e";   // near-black void
const GHOST_OPACITY = 0.12;

// Cosmograph feel: near-black fill, glowing border, dim label
// [bg, border, labelColor]
const TYPE_PALETTE = {
  Person:         ["#04100a", "#1db954", "#1db954"],   // spotify green
  Artist:         ["#04100a", "#1db954", "#1db954"],
  MusicGroup:     ["#07040f", "#8b5cf6", "#8b5cf6"],   // violet
  Band:           ["#07040f", "#8b5cf6", "#8b5cf6"],
  Event:          ["#0f0404", "#e05252", "#e05252"],   // coral red
  Concert:        ["#0f0404", "#e05252", "#e05252"],
  Performance:    ["#0f0404", "#e05252", "#e05252"],
  Place:          ["#04080f", "#38bdf8", "#38bdf8"],   // sky blue
  Stadium:        ["#04080f", "#38bdf8", "#38bdf8"],
  Venue:          ["#04080f", "#38bdf8", "#38bdf8"],
  Album:          ["#080410", "#a78bfa", "#a78bfa"],   // lavender
  MusicAlbum:     ["#080410", "#a78bfa", "#a78bfa"],
  Song:           ["#04100f", "#2dd4bf", "#2dd4bf"],   // teal
  MusicRecording: ["#04100f", "#2dd4bf", "#2dd4bf"],
  Organization:   ["#0f0c04", "#f59e0b", "#f59e0b"],  // amber
  default:        ["#050a12", "#4a7fa8", "#4a7fa8"],
};

function typeStyle(cls) {
  const key = Object.keys(TYPE_PALETTE).find(
    (k) => k.toLowerCase() === (cls || "").toLowerCase()
  );
  const [bg, border, text] = TYPE_PALETTE[key || "default"];
  return { "background-color": bg, "border-color": border, color: text };
}

// Active / focal use the same glow approach
const ACTIVE_STYLE = {
  "background-color": "#0a0418",
  "border-color": "#8b5cf6",
  "border-width": 2.5,
  color: "#c4b5fd",
};
const FOCAL_STYLE = {
  "background-color": "#0f0a00",
  "border-color": "#f59e0b",
  "border-width": 3,
  color: "#fde68a",
};
const DIM_STYLE = {
  "background-color": BG,
  "border-color": "#0d1117",
  color: "#0d1117",
};

// Slight organic jitter on ring positions so nodes don't sit in a perfect circle
function jitter(v, amount = 18) {
  return v + (Math.random() - 0.5) * amount;
}

function radialPositions(cx, cy2, count, radius) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return {
      x: jitter(cx + Math.cos(angle) * radius),
      y: jitter(cy2 + Math.sin(angle) * radius),
    };
  });
}

function shortUri(uri) {
  return uri.split("#").pop().split("/").pop();
}

const DriftCanvas = forwardRef(function DriftCanvas(_props, ref) {
  const containerRef = useRef(null);
  const cyRef        = useRef(null);
  const flowRef      = useRef(null);
  const expandedRef  = useRef(new Set());
  // track which node IDs belong to each expansion pass so we can fade them later
  const ringSetRef   = useRef({}); // uri → Set of neighbour node IDs

  useEffect(() => {
    if (!containerRef.current) return;
    const cy = cytoscape({
      container: containerRef.current,
      elements: [],
      style: [
        {
          selector: "node",
          style: {
            "background-color": BG,
            "border-color": "#0d1117",
            "border-width": 1.5,
            label: "data(label)",
            color: "#1e2a38",
            "font-size": "10px",
            "font-weight": "500",
            "text-valign": "bottom",
            "text-margin-y": 4,
            "text-outline-color": BG,
            "text-outline-width": "2px",
            "text-wrap": "wrap",
            "text-max-width": "110px",
            width: 28, height: 28,
            opacity: 1,
            "transition-property":
              "background-color, border-color, border-width, width, height, color, opacity",
            "transition-duration": "700ms",
            "transition-timing-function": "ease-in-out",
          },
        },
        {
          selector: "edge",
          style: {
            width: 0.7,
            "line-color": "#0d1f2d",
            "target-arrow-color": "#0d1f2d",
            "target-arrow-shape": "none",   // arrows feel too heavy; lines only
            "curve-style": "bezier",
            label: "",                       // hide edge labels — too noisy
            opacity: 0.3,
            "transition-property": "line-color, opacity, width",
            "transition-duration": "700ms",
            "transition-timing-function": "ease-in-out",
          },
        },
      ],
      userZoomingEnabled: true,
      userPanningEnabled: true,
      minZoom: 0.04,
      maxZoom: 3,
    });
    cyRef.current = cy;
    return () => cy.destroy();
  }, []);

  useImperativeHandle(ref, () => ({

    async expandNode(uri) {
      const cy = cyRef.current;
      if (!cy || expandedRef.current.has(uri)) return;
      expandedRef.current.add(uri);

      // Gently fade ALL existing nodes before the new ring appears
      cy.nodes().forEach((n) => {
        if (n.id() !== uri) {
          n.style({ ...DIM_STYLE, opacity: GHOST_OPACITY });
        }
      });
      cy.edges().style({ opacity: 0.04 });

      const data = await fetchNeighbours(uri);

      // Ensure focal node is visible and bright
      let focalNode = cy.getElementById(uri);
      if (!focalNode.length) {
        cy.add({
          data: { id: uri, label: data.label },
          position: { x: 0, y: 0 },
          style: { opacity: 0, width: 0, height: 0 },
        });
        focalNode = cy.getElementById(uri);
      }
      focalNode.style({
        ...ACTIVE_STYLE,
        width: 52, height: 52,
        "font-size": "12px",
        opacity: 1,
      });

      const focalPos = focalNode.position();
      const edges = data.edges.slice(0, 13);
      const positions = radialPositions(focalPos.x, focalPos.y, edges.length, RING_RADIUS);
      const ringIds = new Set();

      edges.forEach((e, i) => {
        ringIds.add(e.target_uri);

        if (!cy.getElementById(e.target_uri).length) {
          cy.add({
            data: { id: e.target_uri, label: e.target_label },
            position: { ...focalPos },
            style: { opacity: 0, width: 0, height: 0 },
          });
        }

        const edgeId = `e-${uri}-${e.target_uri}`;
        if (!cy.getElementById(edgeId).length) {
          cy.add({
            data: { id: edgeId, source: uri, target: e.target_uri, label: e.predicate_label },
            style: { opacity: 0 },
          });
        }

        // Stagger with gentle easing — longer delay, slight randomness
        const delay = 120 + i * 90 + Math.random() * 40;
        setTimeout(() => {
          const node = cy.getElementById(e.target_uri);
          // Fly outward
          node.animate(
            { position: positions[i] },
            { duration: 900, easing: "ease-out-cubic" }
          );
          // Fade in smoothly with type color
          node.style({
            opacity: 0.85,
            width: 28, height: 28,
            ...typeStyle(e.target_class),
          });

          // Corresponding edge fades in slightly after node
          setTimeout(() => {
            cy.getElementById(edgeId).style({ opacity: 0.35 });
          }, 300);
        }, delay);
      });

      ringSetRef.current[uri] = ringIds;
    },

    zoomTo(uri, zoom = 1.4) {
      const cy = cyRef.current;
      if (!cy) return;
      const node = cy.getElementById(uri);
      if (!node.length) return;
      // Slow, cinematic zoom
      cy.animate(
        { center: { eles: node }, zoom },
        { duration: 1400, easing: "ease-in-out-cubic" }
      );
    },

    pulseNode(uri, confidence = 0.8) {
      const cy = cyRef.current;
      if (!cy) return;
      const node = cy.getElementById(uri);
      if (!node.length) return;
      const size = 44 + confidence * 26;
      const hue = 258 + confidence * 28;
      const light = 38 + confidence * 22;

      // Swell up then breathe back
      node.style({
        "background-color": `hsl(${hue}, 78%, ${light}%)`,
        "border-color": `hsl(${hue}, 88%, 65%)`,
        "border-width": 2 + confidence * 5,
        color: "#e2e8f0",
        width: size * 1.55, height: size * 1.55,
        opacity: 1,
        "transition-duration": "600ms",
      });
      setTimeout(() => {
        node.style({
          width: size, height: size,
          "transition-duration": "1000ms",
        });
      }, 600);
    },

    tracePath(path) {
      const cy = cyRef.current;
      if (!cy) return;

      // Particle flow overlay
      const points = path
        .map((uri) => cy.getElementById(uri)?.renderedPosition())
        .filter(Boolean);
      if (points.length >= 2 && flowRef.current) {
        flowRef.current.flowAlongPath(points, 260, (segIdx) => {
          // Pulse the node we just arrived at
          const arrivedUri = path[segIdx + 1];
          if (!arrivedUri) return;
          const node = cy.getElementById(arrivedUri);
          if (!node.length) return;
          node.style({
            "border-color": "#a855f7",
            "border-width": 3,
            opacity: 1,
            "transition-duration": "300ms",
          });
          setTimeout(() => {
            node.style({ "border-width": 2, "transition-duration": "800ms" });
          }, 500);
        });
      }

      // Keep edge highlight too for readability
      path.forEach((uri, i) => {
        if (i === 0) return;
        const src = path[i - 1];
        const edge = cy.edges(
          `[source="${src}"][target="${uri}"], [source="${uri}"][target="${src}"]`
        );
        setTimeout(() => {
          edge.style({
            "line-color": "#7c3aed",
            opacity: 0.7,
            width: 1.5,
            "transition-duration": "400ms",
          });
          setTimeout(() => {
            edge.style({
              "line-color": "#0d1f2d",
              opacity: 0.2,
              width: 0.7,
              "transition-duration": "1400ms",
            });
          }, 2000);
        }, i * 450);
      });
    },

    fadeRing(exceptUri) {
      const cy = cyRef.current;
      if (!cy) return;
      cy.nodes().forEach((n) => {
        if (n.id() === exceptUri) return;
        const pos = n.position();
        const cx = pos.x, cy2 = pos.y;
        // Drift outward slightly while fading
        const angle = Math.random() * Math.PI * 2;
        const drift = 40 + Math.random() * 30;
        n.animate(
          { position: { x: cx + Math.cos(angle) * drift, y: cy2 + Math.sin(angle) * drift } },
          { duration: 1800, easing: "ease-in-out-cubic" }
        );
        n.style({ ...DIM_STYLE, opacity: 0.07, "transition-duration": "1600ms" });
      });
      cy.edges().style({ opacity: 0.04, "transition-duration": "1400ms" });
    },

    settleNodes(uris) {
      const cy = cyRef.current;
      if (!cy) return;
      cy.nodes().forEach((n) => {
        if (uris.includes(n.id())) {
          n.style({
            ...FOCAL_STYLE,
            width: 62, height: 62,
            opacity: 1,
            "transition-duration": "1200ms",
          });
        } else {
          n.style({ ...DIM_STYLE, opacity: 0.07, "transition-duration": "1500ms" });
        }
      });
      cy.edges().style({ opacity: 0.04, "transition-duration": "1500ms" });
    },

    fitAll() {
      const cy = cyRef.current;
      if (!cy) return;
      cy.animate(
        { fit: { eles: cy.elements(), padding: 120 } },
        { duration: 1200, easing: "ease-in-out-cubic" }
      );
    },

    reset() {
      const cy = cyRef.current;
      if (!cy) return;
      cy.elements().remove();
      expandedRef.current.clear();
      ringSetRef.current = {};
      flowRef.current?.clear();
    },
  }));

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%", background: BG }} />
      <FlowCanvas ref={flowRef} />
    </div>
  );
});

export default DriftCanvas;
