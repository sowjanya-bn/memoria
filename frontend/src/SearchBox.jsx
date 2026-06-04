import { useState, useEffect, useRef } from "react";
import { fetchSearch } from "./api";

export default function SearchBox({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const timeoutRef = useRef(null);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(async () => {
      try {
        const data = await fetchSearch(query);
        setResults(data);
        setOpen(data.length > 0);
        setActiveIdx(-1);
      } catch {
        setResults([]);
      }
    }, 200);
    return () => clearTimeout(timeoutRef.current);
  }, [query]);

  function select(item) {
    setQuery("");
    setResults([]);
    setOpen(false);
    onSelect(item.uri);
  }

  function handleKey(e) {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      select(results[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="search-box" onKeyDown={handleKey}>
      <input
        type="text"
        placeholder="Search entities…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="search-input"
      />
      {open && (
        <ul className="search-dropdown">
          {results.map((r, i) => (
            <li
              key={r.uri}
              className={`search-result${i === activeIdx ? " active" : ""}`}
              onMouseDown={() => select(r)}
            >
              <span className="result-label">{r.label}</span>
              {r.classes.length > 0 && (
                <span className="result-class">{r.classes[0]}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
