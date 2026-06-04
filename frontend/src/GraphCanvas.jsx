import { useEffect, useRef, useCallback } from "react";
import cytoscape from "cytoscape";

const CLASS_COLORS = {
  MusicGroup: "#7c3aed",
  MusicEnsemble: "#7c3aed",
  Person: "#0891b2",
  MusicEvent: "#dc2626",
  LivePerformance: "#ea580c",
  MusicVenue: "#16a34a",
  ItemList: "#ca8a04",
  MusicGenre: "#db2777",
  MusicEntity: "#4f46e5",
  default: "#64748b",
};

function nodeColor(cls) {
  return CLASS_COLORS[cls] || CLASS_COLORS.default;
}

export default function GraphCanvas({ scene, onNodeClick, onGroupedClick, streaming }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);

  const buildElements = useCallback((scene) => {
    if (!scene) return [];
    const elements = [];
    const seen = new Set();

    // Focal node
    elements.push({
      data: {
        id: scene.focal_uri,
        label: scene.label,
        class: scene.class,
        type: "focal",
        color: nodeColor(scene.class),
      },
    });
    seen.add(scene.focal_uri);

    // Primary edges
    scene.primary_edges.forEach((edge, i) => {
      const tid = edge.target_uri;
      if (!seen.has(tid)) {
        elements.push({
          data: {
            id: tid,
            label: edge.target_label,
            class: edge.target_class,
            type: "primary",
            color: nodeColor(edge.target_class),
          },
        });
        seen.add(tid);
      }
      elements.push({
        data: {
          id: `e-primary-${i}-${tid}`,
          source: scene.focal_uri,
          target: tid,
          label: edge.predicate_label,
          predicate_uri: edge.predicate_uri,
          type: "primary",
        },
      });
    });

    // Grouped handle nodes (synthetic)
    scene.grouped_handles.forEach((handle, i) => {
      const hid = `__grouped__${i}__${handle.predicate_uri}`;
      elements.push({
        data: {
          id: hid,
          label: `${handle.predicate_label}\n${handle.count}`,
          class: handle.member_class,
          type: "grouped",
          count: handle.count,
          predicate_uri: handle.predicate_uri,
          subject_uri: scene.focal_uri,
          color: "#94a3b8",
        },
      });
      elements.push({
        data: {
          id: `e-grouped-${i}`,
          source: scene.focal_uri,
          target: hid,
          label: handle.predicate_label,
          type: "grouped",
        },
      });
    });

    return elements;
  }, []);

  useEffect(() => {
    if (!containerRef.current || !scene) return;

    const elements = buildElements(scene);

    if (cyRef.current) {
      cyRef.current.destroy();
    }

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: "node",
          style: {
            "background-color": "data(color)",
            label: "data(label)",
            "text-valign": "bottom",
            "text-halign": "center",
            "font-size": "11px",
            color: "#e2e8f0",
            "text-outline-color": "#0f172a",
            "text-outline-width": "2px",
            "text-wrap": "wrap",
            "text-max-width": "120px",
            width: 40,
            height: 40,
            "border-width": 0,
          },
        },
        {
          selector: 'node[type="focal"]',
          style: {
            "background-color": "#f59e0b",
            width: 60,
            height: 60,
            "font-size": "13px",
            "font-weight": "bold",
            color: "#fff",
            "z-index": 10,
          },
        },
        {
          selector: 'node[type="grouped"]',
          style: {
            "background-color": "#334155",
            "border-color": "#94a3b8",
            "border-width": 2,
            "border-style": "dashed",
            shape: "round-rectangle",
            width: 80,
            height: 44,
            "font-size": "10px",
            color: "#94a3b8",
          },
        },
        {
          selector: "node:selected",
          style: {
            "border-color": "#f59e0b",
            "border-width": 3,
          },
        },
        {
          selector: "edge",
          style: {
            width: 1.5,
            "line-color": "#334155",
            "target-arrow-color": "#334155",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": "9px",
            color: "#64748b",
            "text-outline-color": "#0f172a",
            "text-outline-width": "1px",
            "text-rotation": "autorotate",
          },
        },
        {
          selector: 'edge[type="grouped"]',
          style: {
            "line-style": "dashed",
            "line-color": "#475569",
          },
        },
      ],
      layout: {
        name: "concentric",
        animate: true,
        animationDuration: 500,
        animationEasing: "ease-out",
        fit: true,
        padding: 60,
        startAngle: Math.PI / 2,
        sweep: 2 * Math.PI,
        clockwise: true,
        equidistant: false,
        minNodeSpacing: 40,
        concentric(node) {
          return node.data("type") === "focal" ? 10 : 1;
        },
        levelWidth() {
          return 1;
        },
      },
      userZoomingEnabled: true,
      userPanningEnabled: true,
      minZoom: 0.2,
      maxZoom: 3,
    });

    cy.on("tap", "node", (evt) => {
      const data = evt.target.data();
      if (data.type === "grouped") {
        onGroupedClick?.({
          subjectUri: data.subject_uri,
          predicateUri: data.predicate_uri,
          label: data.label,
        });
      } else if (data.type === "primary" || data.type === "focal") {
        onNodeClick?.(data.id);
      }
    });

    cyRef.current = cy;

    return () => {
      cy.destroy();
    };
  }, [scene, buildElements, onNodeClick, onGroupedClick]);

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
      <div
        ref={containerRef}
        style={{ width: "100%", height: "100%", background: "#0f172a" }}
      />
      {streaming && (
        <div className="stream-indicator">
          <span className="stream-dot" />
          Loading connections…
        </div>
      )}
    </div>
  );
}
