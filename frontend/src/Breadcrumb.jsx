export default function Breadcrumb({ breadcrumb, entities, onNavigate, onHome }) {
  if (breadcrumb.length === 0) return null;

  return (
    <nav className="breadcrumb">
      <button className="breadcrumb-home" onClick={onHome} title="Back to starting points">
        ⌂
      </button>
      {breadcrumb.map((uri, i) => (
        <span key={uri} className="breadcrumb-item">
          <span className="breadcrumb-sep">›</span>
          <button
            className="breadcrumb-link"
            onClick={() => onNavigate(uri, breadcrumb.slice(0, i))}
          >
            {entities[uri] || uri.split("#").pop().split("/").pop()}
          </button>
        </span>
      ))}
    </nav>
  );
}
