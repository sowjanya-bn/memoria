export default function EntityCard({ scene, onNodeClick, onGroupedExpand, showDetails, onToggleDetails }) {
  if (!scene) return null;

  const shortClass = (cls) => cls.split("#").pop().split("/").pop();

  return (
    <div className="entity-card">
      {scene.image && (
        <img
          src={scene.image}
          alt={scene.label}
          className="entity-image"
          onError={(e) => { e.target.style.display = "none"; }}
        />
      )}

      <div className="entity-header">
        <h2 className="entity-label">{scene.label}</h2>
        {scene.class && (
          <span className="entity-class">{scene.class}</span>
        )}
      </div>

      {scene.description && (
        <p className="entity-description">{scene.description}</p>
      )}

      {scene.navigation_note && (
        <p className="entity-note">{scene.navigation_note}</p>
      )}

      {/* Primary edges */}
      {scene.primary_edges.length > 0 && (
        <section className="card-section">
          <h3>Connections</h3>
          <ul className="edge-list">
            {scene.primary_edges.map((edge, i) => (
              <li key={i} className="edge-item">
                <span className="edge-pred">{edge.predicate_label}</span>
                <button
                  className="edge-target"
                  onClick={() => onNodeClick(edge.target_uri)}
                  title={edge.target_uri}
                >
                  {edge.target_label}
                  {edge.target_class && (
                    <span className="edge-class">{shortClass(edge.target_class)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Grouped handles */}
      {scene.grouped_handles.length > 0 && (
        <section className="card-section">
          <h3>Collections</h3>
          <ul className="grouped-list">
            {scene.grouped_handles.map((handle, i) => (
              <li key={i} className="grouped-item">
                <button
                  className="grouped-handle"
                  onClick={() =>
                    onGroupedExpand({
                      subjectUri: scene.focal_uri,
                      predicateUri: handle.predicate_uri,
                      label: handle.predicate_label,
                    })
                  }
                >
                  <span className="grouped-label">{handle.predicate_label}</span>
                  <span className="grouped-count">{handle.count}</span>
                  <span className="grouped-arrow">›</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Detail toggle */}
      {scene.detail_count > 0 && (
        <button className="detail-toggle" onClick={onToggleDetails}>
          {showDetails
            ? "Hide detail"
            : `Show ${scene.detail_count} detail ${scene.detail_count === 1 ? "triple" : "triples"}`}
        </button>
      )}
    </div>
  );
}
