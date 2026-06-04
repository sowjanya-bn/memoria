import { useEffect, useState } from "react";
import { fetchSuggestions } from "./api";

const PAGE_SIZE = 8;

export default function StartingPoints({ onSelect }) {
  const [all, setAll] = useState([]);
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load(attempt = 0) {
      try {
        const data = await fetchSuggestions(50);
        if (!cancelled) { setAll(data); setLoading(false); }
      } catch {
        if (!cancelled && attempt < 10) {
          setTimeout(() => load(attempt + 1), 1500);
        } else if (!cancelled) {
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const shortClass = (classes) => {
    if (!classes?.length) return "";
    return classes[0].split("#").pop().split("/").pop();
  };

  const shown = all.slice(0, visible);
  const hasMore = visible < all.length;

  return (
    <div className="starting-points">
      <h1 className="app-title">Memoria</h1>
      <p className="app-subtitle">Suggested starting points</p>

      {loading ? (
        <p className="loading-msg">Loading graph…</p>
      ) : (
        <>
          <ul className="suggestions-list">
            {shown.map((s) => (
              <li key={s.uri} className="suggestion-item">
                <button className="suggestion-btn" onClick={() => onSelect(s.uri)}>
                  <span className="suggestion-label">{s.label}</span>
                  <span className="suggestion-class">{shortClass(s.classes)}</span>
                  <span className="suggestion-note">{s.note}</span>
                </button>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button
              className="load-more-btn"
              onClick={() => setVisible((v) => v + PAGE_SIZE)}
            >
              Show more ({all.length - visible} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
}
