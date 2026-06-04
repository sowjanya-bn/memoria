import { useEffect, useState } from "react";
import { fetchSuggestions } from "../api";
import DwellNode from "./DwellNode";

export default function InstallationStarting({ onSelect }) {
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load(attempt = 0) {
      try {
        const data = await fetchSuggestions(8);
        if (!cancelled) { setSuggestions(data); setLoading(false); }
      } catch {
        if (!cancelled && attempt < 10) setTimeout(() => load(attempt + 1), 1500);
        else if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="inst-starting">
      <h1 className="inst-title">Memoria</h1>
      <p className="inst-subtitle">Reach out and begin exploring</p>
      {loading ? (
        <p className="inst-loading">Loading…</p>
      ) : (
        <div className="inst-starting-grid">
          {suggestions.map((s) => (
            <div key={s.uri} className="inst-starting-item">
              <DwellNode
                label={s.label}
                cls={s.classes?.[0]?.split("#").pop().split("/").pop()}
                onSelect={() => onSelect(s.uri)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
