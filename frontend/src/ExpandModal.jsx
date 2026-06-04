import { useState, useEffect } from "react";
import { fetchExpand } from "./api";

export default function ExpandModal({ handle, onNavigate, onClose }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!handle) return;
    setLoading(true);
    fetchExpand(handle.subjectUri, handle.predicateUri)
      .then((data) => setMembers(data.members))
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [handle]);

  if (!handle) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{handle.label} <span className="modal-count">({members.length})</span></h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <p className="modal-loading">Loading…</p>
          ) : (
            <ul className="member-list">
              {members.map((m) => (
                <li key={m.uri} className="member-item">
                  <button
                    className="member-link"
                    onClick={() => { onNavigate(m.uri); onClose(); }}
                  >
                    {m.label}
                    {m.class && <span className="member-class">{m.class}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
