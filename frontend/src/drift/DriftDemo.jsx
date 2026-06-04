import { useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { playDriftSequence } from "./driftStub";
import DriftCanvas from "./DriftCanvas";
import "./drift.css";

export default function DriftDemo() {
  const canvasRef   = useRef(null);
  const cancelRef   = useRef(null);
  const [phase, setPhase]   = useState("idle");   // idle | drifting | settled
  const [label, setLabel]   = useState(null);
  const [flash, setFlash]   = useState(false);

  const triggerFlash = useCallback(() => {
    setFlash(true);
    setTimeout(() => setFlash(false), 600);
  }, []);

  const handleEvent = useCallback((event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    switch (event.event) {
      case "expand":
        canvas.expandNode(event.uri);
        break;
      case "zoom":
        canvas.zoomTo(event.uri, event.level || 1.4);
        break;
      case "pulse":
        canvas.pulseNode(event.uri, event.confidence ?? 0.8);
        break;
      case "trace":
        canvas.tracePath(event.path);
        break;
      case "fit":
        canvas.fitAll();
        break;
      case "fadeRing":
        canvas.fadeRing(event.exceptUri);
        break;
      case "dim":
        canvas.dimAll?.();
        break;
      case "settle":
        canvas.settleNodes(event.uris);
        setPhase("settled");
        break;
      case "label":
        setLabel(event.text);
        break;
    }
  }, []);

  function handleTrigger() {
    if (cancelRef.current) cancelRef.current();
    canvasRef.current?.reset();
    setPhase("drifting");
    setLabel(null);
    triggerFlash();

    setTimeout(() => {
      cancelRef.current = playDriftSequence(handleEvent);
    }, 400);
  }

  function handleReset() {
    if (cancelRef.current) cancelRef.current();
    canvasRef.current?.reset();
    setPhase("idle");
    setLabel(null);
  }

  return (
    <div className="drift-demo-root">
      {/* Header */}
      <div className="drift-header">
        <span className="drift-wordmark">Oracle Drift</span>
        <span className="drift-act">{label || "Live Aid 1985 Knowledge Graph"}</span>
        <div className="drift-nav">
          <Link to="/installation" className="drift-link">Installation</Link>
          <Link to="/cosmos" className="drift-link">Cosmos</Link>
          <Link to="/" className="drift-link">Desktop</Link>
        </div>
      </div>

      {/* Canvas */}
      <div className="drift-canvas-wrap">
        <DriftCanvas ref={canvasRef} phase={phase} />

        {phase === "drifting" && <div className="drift-bg-pulse" />}
        {flash && <div className="drift-flash" />}

        {phase === "settled" && (
          <div className="drift-settled">
            <p>Retrieval complete</p>
            <p className="drift-settled-entities">
              Queen · Live Aid Performance · Wembley Stadium
            </p>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="drift-controls">
        <span className="drift-seq-label">
          Query: "Tell me about Queen's Live Aid performance"
        </span>
        <button
          className={`drift-trigger-btn${phase === "drifting" ? " running" : ""}`}
          onClick={phase === "idle" ? handleTrigger : handleReset}
          disabled={phase === "drifting"}
        >
          {phase === "drifting" ? "Drifting…"
            : phase === "settled" ? "↺ Reset"
            : "▶ Begin journey"}
        </button>
      </div>
    </div>
  );
}
