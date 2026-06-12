# Graph Pagination Strategies

Pagination in a knowledge graph means **progressive disclosure** — revealing depth on demand rather than loading the full graph at once.

---

## Implemented

### Ego-graph expansion (1-hop on demand)
- Seeds the canvas with top-20 nodes from `/suggestions` on mount
- Double-click a node fetches its 1-hop neighbourhood via `GET /neighbours` and injects nodes/edges into the d3-force simulation
- Already tracked via `fetchedRef` — nodes are only expanded once

---

## To Try

### Cursor-based edge pagination on `/neighbours`
High-fan-out nodes (e.g. a genre with 400 artists) load all neighbours in one shot — heavy on both backend and canvas.

**Approach:** add `offset` + `limit` to `GET /neighbours`:
```
GET /neighbours?uri=...&limit=20&offset=0
```
Show a **"+ N more"** button on expanded nodes that fetches the next page. The backend already has the data; the frontend injects each page incrementally into the simulation.

---

### Importance-ranked lazy loading
Leverages the existing `NavigabilityScore` computed per entity in `backend/scoring.py`.

**Approach:** sort neighbours by score descending, load in tiers:
- **Tier 1** (auto-loaded on expand): top 10 by score
- **Tier 2** (click "show more"): next 20
- **Tier 3** (explicit expand): remainder

Surfaces the most interesting paths first without flooding the canvas.

---

### Viewport-aware draw culling
Nodes outside the visible viewport are skipped during the Canvas `draw()` call. The simulation still runs for all nodes so physics stays correct — only the rendering is culled.

**Approach:** bounds check in the draw loop before painting each node:
```js
const sx = n.x * k + tx;
const sy = n.y * k + ty;
if (sx < -r || sx > W + r || sy < -r || sy > H + r) continue;
```
Cheapest to implement; helps most when the graph is zoomed in on a dense cluster.
