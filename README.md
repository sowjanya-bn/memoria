# Memoria

A domain-agnostic RDF knowledge graph explorer. Transforms any TTL file into a staged, navigable scene explorer.

---

## Run

### Backend

```bash
# From the repo root
MEMORIA_TTL=liveaid_instances_master.ttl python3 -m uvicorn backend.api:app --host 0.0.0.0 --port 8765 --reload
```

Logs on startup:
```
INFO:     Application startup complete.
INFO:memoria:Loading graph from liveaid_instances_master.ttl…
INFO:memoria:Graph ready — 5721 entities, 12982 edges (3.2s)
```

### Frontend

```bash
# In a second terminal
cd frontend
npm install       # first time only
npm run dev
```

Open **http://localhost:5173**

---

## Both at once

```bash
./start.sh
```

---

## Use a different graph

```bash
MEMORIA_TTL=path/to/your.ttl ./start.sh
```

---

## CLI (Phase 1 — no UI)

```bash
# Navigability report
python3 -m backend.cli liveaid_instances_master.ttl --report

# Scene for a specific entity
python3 -m backend.cli liveaid_instances_master.ttl ex:Queen

# Save scene JSON to file
python3 -m backend.cli liveaid_instances_master.ttl ex:LiveAid1985 --out scene.json
```

---

## API endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/suggestions?top=N` | Ranked starting point suggestions |
| GET | `/scene?uri=<uri>` | Stream scene as NDJSON |
| GET | `/search?q=<query>` | Label autocomplete |
| GET | `/expand?subject_uri=&predicate_uri=` | Expand a grouped handle |
| GET | `/entity/<uri>` | Full entity record |

---

## Stack

- **Backend** — Python, RDFLib, NetworkX, FastAPI, uvicorn
- **Frontend** — React, Vite, Cytoscape.js
