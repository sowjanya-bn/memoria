import { useState, useCallback } from "react";
import { streamScene } from "../api";

const MAX_SCENES = 5;

export function useInstallationScene() {
  const [scene, setScene] = useState(null);
  const [history, setHistory] = useState([]);   // stack of visited URIs
  const [sceneCount, setSceneCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const navigate = useCallback(async (uri) => {
    if (sceneCount >= MAX_SCENES) return;
    setLoading(true);

    const nextHistory = scene ? [...history, scene.focal_uri] : [];
    setScene((prev) => prev
      ? { ...prev, focal_uri: null, label: "", primary_edges: [], grouped_handles: [], streaming: true }
      : { focal_uri: null, label: "", class: "", description: null, image: null,
          primary_edges: [], grouped_handles: [], detail_count: 0,
          navigation_note: null, breadcrumb: nextHistory, streaming: true }
    );
    setHistory(nextHistory);

    try {
      await streamScene(uri, nextHistory, (chunk) => {
        setScene((prev) => {
          if (!prev) return prev;
          switch (chunk.type) {
            case "meta":
              return { ...prev, focal_uri: chunk.focal_uri, label: chunk.label,
                class: chunk.class, description: chunk.description, image: chunk.image,
                total_edges: chunk.total_edges };
            case "edges":
              return { ...prev, primary_edges: [...prev.primary_edges, ...chunk.edges] };
            case "grouped":
              return { ...prev, grouped_handles: chunk.handles };
            case "done":
              return { ...prev, detail_count: chunk.detail_count,
                navigation_note: chunk.navigation_note, streaming: false };
            default: return prev;
          }
        });
      });
      setSceneCount((c) => c + 1);
    } finally {
      setLoading(false);
    }
  }, [scene, history, sceneCount]);

  const goBack = useCallback(async () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    const nextHistory = history.slice(0, -1);
    setHistory(nextHistory);
    setSceneCount((c) => Math.max(0, c - 1));
    setLoading(true);
    try {
      await streamScene(prev, nextHistory, (chunk) => {
        setScene((s) => {
          if (!s) return s;
          switch (chunk.type) {
            case "meta": return { ...s, focal_uri: chunk.focal_uri, label: chunk.label,
              class: chunk.class, description: chunk.description, image: chunk.image };
            case "edges": return { ...s, primary_edges: [...(s.primary_edges || []), ...chunk.edges] };
            case "grouped": return { ...s, grouped_handles: chunk.handles };
            case "done": return { ...s, streaming: false };
            default: return s;
          }
        });
      });
    } finally {
      setLoading(false);
    }
  }, [history]);

  const reset = useCallback(() => {
    setScene(null);
    setHistory([]);
    setSceneCount(0);
    setLoading(false);
  }, []);

  const atLimit = sceneCount >= MAX_SCENES;

  return { scene, history, sceneCount, loading, navigate, goBack, reset, atLimit, maxScenes: MAX_SCENES };
}
