# Memoria Graph Explorer — Handover Documentation

## Overview

Memoria is a knowledge graph exploration tool with a React/Vite frontend and a FastAPI backend. The primary deliverable is the **`/explore` route** — a full-screen interactive graph explorer that lets a user visually navigate any RDF knowledge graph loaded from a `.ttl` file.

---

## Architecture

```
Browser (/explore)               Backend (localhost:8765)
────────────────                 ─────────────────────────
GraphExplorerPage.jsx            api.py (FastAPI)
  ├── useTypeColors.js  ──GET /types──────────────────────▶ entity_types()
  ├── fetchSuggestions  ──GET /suggestions────────────────▶ suggestions()
  ├── fetchNeighbours   ──GET /neighbours─────────────────▶ neighbours()
  ├── useScene          ──GET /scene (NDJSON stream)───────▶ scene()
  └── fetchSearch       ──GET /search─────────────────────▶ search()
```

---

## Starting the Application

```bash
./start.sh
```

This script:
1. Kills anything on ports 8765 and 5173
2. Starts the FastAPI backend: `uvicorn backend.api:app --port 8765`
3. Waits until the backend is ready (polls `/suggestions?top=1`)
4. Starts the Vite dev server: `npm run dev`

The backend loads the TTL file set via the env var `MEMORIA_TTL` (default: `liveaid_instances_master.ttl`). The first load can take several seconds for larger graphs.

---

## Backend: `backend/api.py`

### Data model (loaded once at startup)

| Object | Type | Description |
|--------|------|-------------|
| `_model` | `GraphModel` | Parsed RDF graph — all entities with labels, classes, descriptions |
| `_tier_map` | `EdgeTierMap` | Edges classified into tiers: primary (shown), grouped (collapsed), detail |
| `_score_index` | `dict[uri, NavigabilityScore]` | Pre-computed navigability score per entity |

Parsing is done by `backend/ingest.py` (reads `.ttl`), classification by `backend/tiers.py`, scoring by `backend/scoring.py`.

### API Endpoints

#### `GET /suggestions?top=N`
Returns the top-N most navigable entities as starting points.

```json
[{"uri": "...", "label": "Live Aid", "classes": ["http://...#Event"], "score": 0.92, "note": "..."}, ...]
```

**Used by:** `GraphExplorerPage` on mount to seed the initial graph with interesting nodes.

---

#### `GET /scene?uri=...&breadcrumb=...`
Streams a scene description for a focal entity as **NDJSON** (newline-delimited JSON). Sends 4 chunk types in sequence:

| Chunk type | Contents |
|------------|----------|
| `meta` | Focal entity: label, class, description, image URL |
| `edges` | Batches of 6 primary edges (predicate + target) |
| `grouped` | Collapsed edge groups (predicate + count) for high-fan-out predicates |
| `done` | Total edge count, navigation note |

**Used by:** `useScene` hook in both `App.jsx` (entity detail panel) and `GraphExplorerPage` (right-panel subgraph detail).

---

#### `GET /neighbours?uri=...`
Returns the primary neighbours of an entity (same data as one `/scene` call, flattened).

```json
{"uri": "...", "label": "...", "class": "...", "edges": [...]}
```

**Used by:** Node expansion in `GraphExplorerPage` — when the user clicks expand on a node, its neighbours are fetched and added to the d3-force simulation.

---

#### `GET /types`
Returns all distinct entity classes in the loaded KG, sorted by frequency.

```json
[{"type": "Artist", "count": 412}, {"type": "Event", "count": 38}, ...]
```

**Used by:** `useTypeColors` hook to build a dynamic color palette — one color per type, spread across the HSL hue wheel. This means the color scheme adapts automatically to any KG.

---

#### `GET /search?q=...&limit=N`
Label substring search with prefix-match ranking.

```json
[{"uri": "...", "label": "Queen", "classes": ["Artist"]}, ...]
```

**Used by:** The search box in both `App.jsx` and `GraphExplorerPage`.

---

#### `GET /expand?subject_uri=...&predicate_uri=...`
Expands a collapsed group handle — returns all members for a (subject, predicate) pair. Used by the entity detail panel when the user clicks a grouped edge.

---

## Frontend: Key Files

### `src/GraphExplorerPage.jsx`
The main explorer component, mounted at `/explore`. ~600 lines.

**Left panel — d3-force canvas overview:**

- Uses `d3-force` physics: repulsion (`forceManyBody`), spring links (`forceLink`), gravity (`forceCenter`), collision (`forceCollide`)
- Renders to an HTML5 `<canvas>` using the 2D Canvas API — no SVG, no DOM per node
- Supports **pan** (drag background), **zoom** (wheel), **node drag** (click+drag a node)
- On mount, fetches `/suggestions` and seeds the simulation with top-20 nodes
- **Node expansion:** right-click or double-click a node calls `/neighbours`, adds returned nodes+edges to the simulation
- **Neighbourhood highlight:** on hover, non-neighbours are drawn at 10% opacity, neighbours glow cyan — implemented via a `neighboursRef` Set updated on `mousemove`
- **Node colors:** each node stores a `cls` field (entity class); colors come from `colorForType(cls)` which reads `useTypeColors`'s ref map — never stale inside draw closures
- **Click → select:** clicking a node triggers `useScene` to load the subgraph detail (right panel) and animates the canvas to center that node using a `requestAnimationFrame` ease-in-out loop
- **Animated pan:** simulation is paused (`simRef.current.stop()`) during the animation, restarted on completion
- **Export:** "Export HTML" button calls `exportHTML()` which bakes all current nodes/links into a self-contained vanilla-JS HTML file that works without the backend

**Right panel — Cytoscape subgraph detail:**

- Uses `Cytoscape.js` with a concentric layout to show the focal node and its immediate neighbours
- Rendered inside a floating panel positioned relative to the selected node's canvas coordinates
- Panel starts at 40% scale (`CSS transform: scale(0.4)`) and expands to 100% on hover — the component is always mounted (never unmounted on collapse) to avoid Cytoscape re-layout cost
- Panel is draggable via `panelDragRef` (mouse-event driven offset tracking)
- `useScene` streams the subgraph asynchronously; Cytoscape graph rebuilds as chunks arrive

---

### `src/useTypeColors.js`
Hook that fetches `/types` once (module-level `_cache`) and builds a color map.

- Palette: `hsl(h, 30%, 42%)` per type, hue spread evenly across 0–360°
- Color map stored in a `useRef` so `colorForType` is a stable, non-stale closure safe to call inside `requestAnimationFrame` draw loops
- Returns `{ colorForType, legend, mapRef }`

---

### `src/useScene.js`
Hook that streams `/scene` via `streamScene()` from `api.js`. Handles:
- Incremental state merges as `edges` chunks arrive
- Breadcrumb tracking for back-navigation
- `mergeExpanded(uri, edges)` to inject neighbour edges from `/neighbours` into the current scene

---

### `src/api.js`
All HTTP calls in one place. Uses `VITE_API_URL` env var (defaults to empty string, relies on Vite dev proxy).

Key functions:
- `fetchSuggestions(top)` — GET /suggestions
- `streamScene(uri, breadcrumb, onChunk)` — streaming NDJSON reader
- `fetchNeighbours(uri)` — GET /neighbours
- `fetchTypes()` — GET /types
- `fetchSearch(q, limit)` — GET /search
- `fetchExpand(subjectUri, predicateUri)` — GET /expand

---

### `src/GraphCanvas.jsx`
A simpler Cytoscape-based canvas used for the subgraph detail panel inside `GraphExplorerPage` (right panel). Also used standalone in `App.jsx` (the home route). Accepts a `scene` object and renders it with Cytoscape's concentric layout.

---

### `vite.config.js`
Proxies all API paths to `http://localhost:8765` during development:
`/suggestions`, `/scene`, `/search`, `/expand`, `/entity`, `/neighbours`, `/types`

---

## Rendering Libraries — Why What Was Chosen

| Library | Role | Why |
|---------|------|-----|
| **d3-force** | Physics simulation for the overview graph | Mature, highly configurable, runs headlessly (outputs x/y only) |
| **Canvas 2D API** | Drawing the overview graph | Fast for thousands of nodes; no per-node DOM overhead |
| **Cytoscape.js** | Subgraph detail panel | Feature-rich graph library with good layout algorithms (concentric); handles small subgraphs well |
| **React Router** | `/` and `/explore` routes | Standard SPA routing |

**Alternatives spiked and rejected:**
- **Reagraph** (Three.js/WebGL): visually impressive but limited layout control, zoom sensitivity issues, harder to customise
- **Sigma.js** (WebGL): fast renderer but `@react-sigma/core` integration had CSS pollution issues and complex graph-state lifecycle

---

## Changing the Knowledge Graph

Set the `MEMORIA_TTL` environment variable before starting:

```bash
MEMORIA_TTL=my_graph.ttl ./start.sh
```

The file must be valid Turtle (`.ttl`). The backend reads `rdf:type` for entity classes (used to color nodes), `rdfs:label` for display names, and `dbo:abstract`/`schema:description` for descriptions.

Node colors adapt automatically — `useTypeColors` fetches the type list from the running backend, so no frontend changes are needed when switching graphs.

---

## File Map (post-cleanup)

```
memoria/
├── backend/
│   ├── api.py          ← FastAPI routes
│   ├── ingest.py       ← TTL parser → GraphModel
│   ├── tiers.py        ← Edge tier classification
│   ├── scoring.py      ← Navigability scoring
│   └── scene.py        ← Scene assembly
├── frontend/
│   └── src/
│       ├── main.jsx              ← Router: / and /explore
│       ├── App.jsx               ← Home route (search + entity detail)
│       ├── GraphExplorerPage.jsx ← /explore route (main deliverable)
│       ├── GraphCanvas.jsx       ← Cytoscape component (used by both routes)
│       ├── useScene.js           ← /scene streaming hook
│       ├── useTypeColors.js      ← /types → HSL color map
│       ├── api.js                ← All fetch calls
│       ├── SearchBox.jsx
│       ├── EntityCard.jsx
│       ├── Breadcrumb.jsx
│       ├── ExpandModal.jsx
│       └── StartingPoints.jsx
└── start.sh            ← One-command startup
```
