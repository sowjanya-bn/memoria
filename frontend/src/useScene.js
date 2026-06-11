import { useState, useCallback } from "react";
import { streamScene } from "./api";

const EMPTY_SCENE = {
  focal_uri: null,
  label: "",
  class: "",
  description: null,
  image: null,
  primary_edges: [],
  grouped_handles: [],
  detail_count: 0,
  navigation_note: null,
  breadcrumb: [],
  total_edges: null,   // how many edges to expect (from meta chunk)
  streaming: true,     // true until "done" chunk arrives
  expanded_edges: [],  // edges pulled in via fetchNeighbours
};

export function useScene() {
  const [scene, setScene] = useState(null);
  const [breadcrumb, setBreadcrumb] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const navigate = useCallback(async (uri) => {
    setLoading(true);
    setError(null);

    const nextBreadcrumb = scene ? [...breadcrumb, scene.focal_uri] : [];

    // Reset to empty streaming scene immediately
    setScene({ ...EMPTY_SCENE, breadcrumb: nextBreadcrumb });
    setBreadcrumb(nextBreadcrumb);

    try {
      await streamScene(uri, nextBreadcrumb, (chunk) => {
        setScene((prev) => {
          if (!prev) return prev;
          switch (chunk.type) {
            case "meta":
              return {
                ...prev,
                focal_uri: chunk.focal_uri,
                label: chunk.label,
                class: chunk.class,
                description: chunk.description,
                image: chunk.image,
                total_edges: chunk.total_edges,
              };
            case "edges":
              return {
                ...prev,
                primary_edges: [...prev.primary_edges, ...chunk.edges],
              };
            case "grouped":
              return {
                ...prev,
                grouped_handles: chunk.handles,
              };
            case "done":
              return {
                ...prev,
                detail_count: chunk.detail_count,
                navigation_note: chunk.navigation_note,
                streaming: false,
              };
            default:
              return prev;
          }
        });
      });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [scene, breadcrumb]);

  const mergeExpanded = useCallback((sourceUri, edges) => {
    setScene((prev) => {
      if (!prev) return prev;
      const existingIds = new Set([
        prev.focal_uri,
        ...prev.primary_edges.map((e) => e.target_uri),
        ...(prev.expanded_edges || []).map((e) => e.target_uri),
      ]);
      const fresh = edges
        .map((e) => ({ ...e, source_uri: sourceUri }))
        .filter((e) => !existingIds.has(e.target_uri));
      return { ...prev, expanded_edges: [...(prev.expanded_edges || []), ...fresh] };
    });
  }, []);

  const reset = useCallback(() => {
    setScene(null);
    setBreadcrumb([]);
    setError(null);
  }, []);

  return { scene, breadcrumb, loading, error, navigate, mergeExpanded, reset };
}
