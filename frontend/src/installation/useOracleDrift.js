/**
 * Oracle Drift — Phase 4 stub
 *
 * Connects to a WebSocket at ws://localhost:8765/drift and listens for
 * Echo retrieval events. Returns drift state consumed by InstallationApp.
 *
 * Event contract (from oracle_drift_spec.md):
 *   { event: "retrieval_start",    query_text, timestamp }
 *   { event: "entity_activated",   uri, confidence, timestamp }
 *   { event: "path_considered",    path: [uri, ...], timestamp }
 *   { event: "retrieval_complete", focal_entities: [uri, ...], timestamp }
 *
 * Phase 3: WebSocket is not connected — hook returns inert state.
 * Phase 4: Remove the early return to activate.
 */
import { useState, useEffect } from "react";

const WS_URL = "ws://localhost:8765/drift";

export function useOracleDrift() {
  const [state, setState] = useState({
    active: false,
    activatedUris: [],
    consideredPaths: [],
    focalUris: [],
    queryText: null,
  });

  useEffect(() => {
    // ── Phase 3 stub: not connected ──────────────────────────────────────
    // Remove this return and uncomment the block below when Echo is ready.
    return;

    // ── Phase 4: live connection ─────────────────────────────────────────
    // let ws;
    // function connect() {
    //   ws = new WebSocket(WS_URL);
    //   ws.onmessage = (e) => {
    //     const msg = JSON.parse(e.data);
    //     setState((prev) => {
    //       switch (msg.event) {
    //         case "retrieval_start":
    //           return { ...prev, active: true, queryText: msg.query_text,
    //                    activatedUris: [], consideredPaths: [], focalUris: [] };
    //         case "entity_activated":
    //           return { ...prev, activatedUris: [...prev.activatedUris,
    //                    { uri: msg.uri, confidence: msg.confidence }] };
    //         case "path_considered":
    //           return { ...prev, consideredPaths: [...prev.consideredPaths, msg.path] };
    //         case "retrieval_complete":
    //           return { ...prev, active: false, focalUris: msg.focal_entities };
    //         default: return prev;
    //       }
    //     });
    //   };
    //   ws.onclose = () => setTimeout(connect, 3000); // reconnect
    // }
    // connect();
    // return () => ws?.close();
  }, []);

  return state;
}
