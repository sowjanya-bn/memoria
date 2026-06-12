# Memoria Graph Explorer — Handover Documentation

## Overview

Memoria is a knowledge graph exploration tool with a React/Vite frontend and a FastAPI backend. The primary deliverable is the **`/` route** — a full-screen interactive graph explorer that lets a user visually navigate any RDF knowledge graph loaded from a `.ttl` file.

---

## Architecture

```
Browser (/)                      Backend (localhost:8765)
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

**Used by:** `useScene` hook — streams subgraph detail into the right-panel Cytoscape view when a node is selected.

---

#### `GET /neighbours?uri=...`
Returns the primary neighbours of an entity (same data as one `/scene` call, flattened).

```json
{"uri": "...", "label": "...", "class": "...", "edges": [...]}
```

**Used by:** Node expansion in `GraphExplorerPage` — double-clicking a node fetches its neighbours and adds them to the d3-force simulation.

---

#### `GET /types`
Returns all distinct entity classes in the loaded KG, sorted by frequency.

```json
[{"type": "Artist", "count": 412}, {"type": "Event", "count": 38}, ...]
```

**Used by:** `useTypeColors` hook to build a dynamic color palette — one color per type, spread across the HSL hue wheel. Adapts automatically to any KG.

---

#### `GET /search?q=...&limit=N`
Label substring search with prefix-match ranking.

```json
[{"uri": "...", "label": "Queen", "classes": ["Artist"]}, ...]
```

**Used by:** The search box in `GraphExplorerPage`.

---

#### `GET /expand?subject_uri=...&predicate_uri=...`
Expands a collapsed group handle — returns all members for a (subject, predicate) pair. Used by the entity detail panel when the user clicks a grouped edge.

---

## Frontend: Key Files

### `src/GraphExplorerPage.jsx`
The main explorer component. ~600 lines.

**Left panel — d3-force canvas overview:**

- Uses `d3-force` physics: repulsion (`forceManyBody`), spring links (`forceLink`), gravity (`forceCenter`), collision (`forceCollide`)
- Renders to an HTML5 `<canvas>` using the 2D Canvas API — no SVG, no DOM per node
- Supports **pan** (drag background), **zoom** (wheel), **node drag** (click+drag a node)
- On mount, fetches `/suggestions` and seeds the simulation with top-20 nodes
- **Node expansion:** double-click a node calls `/neighbours`, adds returned nodes+edges to the simulation
- **Neighbourhood highlight:** on hover, non-neighbours are drawn at 10% opacity, neighbours glow cyan — implemented via a `neighboursRef` Set updated on `mousemove`
- **Node colors:** each node stores a `cls` field (entity class); colors come from `colorForType(cls)` which reads `useTypeColors`'s ref map — never stale inside draw closures
- **Click → select:** clicking a node triggers `useScene` to load the subgraph detail (right panel) and animates the canvas to center that node using a `requestAnimationFrame` ease-in-out loop
- **Animated pan:** simulation is paused (`simRef.current.stop()`) during the animation, restarted on completion
- **Export:** "Export HTML" button bakes all current nodes/links into a self-contained vanilla-JS HTML file that works without the backend

**Right panel — Cytoscape subgraph detail:**

- Uses `Cytoscape.js` with a concentric layout to show the focal node and its immediate neighbours
- Floating panel positioned relative to the selected node's canvas coordinates
- Starts at 40% scale (`CSS transform: scale(0.4)`) and expands to 100% on hover — always mounted to avoid Cytoscape re-layout cost
- Draggable via mouse-event offset tracking

---

### `src/useTypeColors.js`
Hook that fetches `/types` once (module-level `_cache`) and builds a color map.

- Palette: `hsl(h, 30%, 42%)` per type, hue spread evenly across 0–360°
- Color map stored in a `useRef` so `colorForType` is a stable closure safe to call inside `requestAnimationFrame` draw loops
- Returns `{ colorForType, legend, mapRef }`

---

### `src/useScene.js`
Hook that streams `/scene` via `streamScene()` from `api.js`. Handles incremental state merges as `edges` chunks arrive, breadcrumb tracking, and `mergeExpanded` for injecting neighbour edges.

---

### `src/api.js`
All HTTP calls in one place. Uses `VITE_API_URL` env var (defaults to empty string, relies on Vite dev proxy).

---

### `src/GraphCanvas.jsx`
Cytoscape component used for the right-panel subgraph detail. Accepts a `scene` object and renders it with Cytoscape's concentric layout.

---

### `vite.config.js`
Proxies all API paths to `http://localhost:8765` during development:
`/suggestions`, `/scene`, `/search`, `/expand`, `/entity`, `/neighbours`, `/types`

---

## Rendering Libraries — Why What Was Chosen

| Library | Role | Why |
|---------|------|-----|
| **d3-force** | Physics simulation for the overview graph | Mature, configurable, runs headlessly (outputs x/y only) |
| **Canvas 2D API** | Drawing the overview graph | Fast for thousands of nodes; no per-node DOM overhead |
| **Cytoscape.js** | Subgraph detail panel | Good layout algorithms (concentric); handles small subgraphs well |
| **React Router** | Client-side routing | Standard SPA routing |

**Alternatives spiked and rejected:**
- **Reagraph** (Three.js/WebGL): limited layout control, zoom sensitivity issues
- **Sigma.js** (WebGL): CSS pollution from `@react-sigma/core`, complex graph-state lifecycle

---

## Changing the Knowledge Graph

```bash
MEMORIA_TTL=my_graph.ttl ./start.sh
```

The file must be valid Turtle (`.ttl`). Node colors adapt automatically — `useTypeColors` fetches the type list from the running backend, so no frontend changes are needed when switching graphs.

---

## File Map

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
│       ├── main.jsx                  ← Router: /
│       ├── GraphExplorerPage.jsx     ← Main explorer (d3-force + Cytoscape)
│       ├── GraphCanvas.jsx           ← Cytoscape subgraph panel
│       ├── useScene.js               ← /scene streaming hook
│       ├── useTypeColors.js          ← /types → HSL color map
│       ├── api.js                    ← All fetch calls
│       ├── SearchBox.jsx
│       ├── EntityCard.jsx
│       ├── Breadcrumb.jsx
│       ├── ExpandModal.jsx
│       └── StartingPoints.jsx
├── EXPLORER_HANDOVER.md      ← This file
├── PAGINATION_STRATEGIES.md  ← Graph pagination roadmap
└── start.sh                  ← One-command startup
```
