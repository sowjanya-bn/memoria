import { useState, useCallback } from "react";
import { useScene } from "./useScene";
import GraphCanvas from "./GraphCanvas";
import EntityCard from "./EntityCard";
import SearchBox from "./SearchBox";
import Breadcrumb from "./Breadcrumb";
import ExpandModal from "./ExpandModal";
import StartingPoints from "./StartingPoints";
import "./App.css";

export default function App() {
  const { scene, breadcrumb, loading, error, navigate, reset } = useScene();
  const [expandHandle, setExpandHandle] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [labelCache, setLabelCache] = useState({});

  const handleNodeClick = useCallback((uri) => {
    if (scene) {
      setLabelCache((prev) => ({ ...prev, [scene.focal_uri]: scene.label }));
    }
    setShowDetails(false);
    navigate(uri);
  }, [scene, navigate]);

  const handleGroupedExpand = useCallback((handle) => {
    setExpandHandle(handle);
  }, []);

  if (!scene && !loading) {
    return (
      <div className="app-root">
        <div className="top-bar">
          <span className="app-wordmark">Memoria</span>
          <SearchBox onSelect={handleNodeClick} />
        </div>
        <StartingPoints onSelect={handleNodeClick} />
      </div>
    );
  }

  return (
    <div className="app-root">
      <div className="top-bar">
        <button className="home-btn" onClick={reset}>Memoria</button>
        <SearchBox onSelect={handleNodeClick} />
        {loading && <span className="loading-indicator">Loading…</span>}
        {error && <span className="error-msg">{error}</span>}
      </div>

      {breadcrumb.length > 0 && (
        <Breadcrumb
          breadcrumb={breadcrumb}
          entities={labelCache}
          onNavigate={handleNodeClick}
          onHome={reset}
        />
      )}

      <div className="main-layout">
        <div className="canvas-area">
          <GraphCanvas
            scene={scene}
            onNodeClick={handleNodeClick}
            onGroupedClick={handleGroupedExpand}
            streaming={scene?.streaming}
          />
        </div>

        <div className="right-panel">
          <EntityCard
            scene={scene}
            onNodeClick={handleNodeClick}
            onGroupedExpand={handleGroupedExpand}
            showDetails={showDetails}
            onToggleDetails={() => setShowDetails((v) => !v)}
          />
        </div>
      </div>

      <ExpandModal
        handle={expandHandle}
        onNavigate={handleNodeClick}
        onClose={() => setExpandHandle(null)}
      />
    </div>
  );
}
