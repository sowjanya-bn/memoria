import { useEffect, useRef, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useInstallationScene } from "./useInstallationScene";
import InstallationCanvas from "./InstallationCanvas";
import InstallationStarting from "./InstallationStarting";
import ExpandModal from "../ExpandModal";
import { useOracleDrift } from "./useOracleDrift";
import "./installation.css";

const RESET_AFTER_LIMIT_MS = 8000; // auto-reset 8s after hitting scene limit

export default function InstallationApp() {
  const { scene, history, sceneCount, loading, navigate, goBack, reset, atLimit, maxScenes } =
    useInstallationScene();
  const [expandHandle, setExpandHandle] = useState(null);
  const resetTimerRef = useRef(null);

  // Oracle Drift — listens for events from Echo (stubbed for Phase 3)
  const drift = useOracleDrift();

  // Auto-reset when scene limit hit
  useEffect(() => {
    if (atLimit) {
      resetTimerRef.current = setTimeout(() => reset(), RESET_AFTER_LIMIT_MS);
    }
    return () => clearTimeout(resetTimerRef.current);
  }, [atLimit, reset]);

  // Swipe gesture for back navigation
  const touchStartX = useRef(null);
  const handleTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const handleTouchEnd = (e) => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx > 80) goBack();          // swipe right → back
    if (dx < -80) reset();          // swipe left → home
    touchStartX.current = null;
  };

  const handleGroupedExpand = useCallback((handle) => {
    setExpandHandle({
      subjectUri: scene.focal_uri,
      predicateUri: handle.predicate_uri,
      label: handle.predicate_label,
    });
  }, [scene]);

  return (
    <div
      className={`inst-root${drift.active ? " drift-active" : ""}`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Minimal chrome */}
      <div className="inst-chrome">
        <span className="inst-wordmark">Memoria</span>
        <div className="inst-session-pips">
          {Array.from({ length: maxScenes }).map((_, i) => (
            <span key={i} className={`inst-pip${i < sceneCount ? " used" : ""}`} />
          ))}
        </div>
        <div className="inst-controls">
          {history.length > 0 && (
            <button className="inst-back-btn" onClick={goBack}>← Back</button>
          )}
          {scene && (
            <button className="inst-home-btn" onClick={reset}>⌂ Start over</button>
          )}
          <Link to="/" className="inst-desktop-link">Desktop</Link>
        </div>
      </div>

      {/* Oracle Drift overlay — visible only while drift is active */}
      {drift.active && <div className="drift-overlay" />}

      {/* Scene limit message */}
      {atLimit && (
        <div className="inst-limit-msg">
          <p>Journey complete.</p>
          <p className="inst-limit-sub">Resetting in a moment…</p>
          <button className="inst-reset-btn" onClick={reset}>Start again</button>
        </div>
      )}

      {/* Main content */}
      {!scene ? (
        <InstallationStarting onSelect={navigate} />
      ) : (
        <div className="inst-main">
          <InstallationCanvas
            scene={scene}
            onNavigate={navigate}
            onGroupedExpand={handleGroupedExpand}
            disabled={atLimit || loading}
          />

          {/* Minimal data panel */}
          {scene.focal_uri && (
            <div className="inst-panel">
              {scene.image && (
                <img
                  src={scene.image}
                  alt={scene.label}
                  className="inst-panel-image"
                  onError={(e) => { e.target.style.display = "none"; }}
                />
              )}
              <h2 className="inst-panel-label">{scene.label}</h2>
              {scene.class && (
                <span className="inst-panel-class">{scene.class}</span>
              )}
              {scene.description && (
                <p className="inst-panel-desc">{scene.description}</p>
              )}
              {scene.navigation_note && (
                <p className="inst-panel-note">{scene.navigation_note}</p>
              )}
              {scene.primary_edges.length > 0 && (
                <div className="inst-panel-connections">
                  <h3>Connections</h3>
                  <ul>
                    {scene.primary_edges.slice(0, 6).map((e, i) => (
                      <li key={i}>
                        <span className="inst-conn-pred">{e.predicate_label}</span>
                        <span className="inst-conn-target">{e.target_label}</span>
                      </li>
                    ))}
                    {scene.primary_edges.length > 6 && (
                      <li className="inst-conn-more">
                        +{scene.primary_edges.length - 6} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <ExpandModal
        handle={expandHandle}
        onNavigate={navigate}
        onClose={() => setExpandHandle(null)}
      />
    </div>
  );
}
