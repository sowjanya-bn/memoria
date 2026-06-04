"""
Memoria FastAPI server — Phase 2
Serves the scene model over HTTP for the React frontend.

Start with:
  uvicorn backend.api:app --reload --port 8000
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Optional

import asyncio
import json

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from .ingest import parse, GraphModel
from .tiers import classify, TierConfig, EdgeTierMap
from .scoring import compute_scores
from .scene import generate_scene

TTL_PATH = os.environ.get("MEMORIA_TTL", "liveaid_instances_master.ttl")
GROUP_THRESHOLD = int(os.environ.get("MEMORIA_GROUP_THRESHOLD", "12"))

app = FastAPI(title="Memoria", version="0.1")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Lazy-loaded singletons ──────────────────────────────────────────────────

_model: Optional[GraphModel] = None
_tier_map: Optional[EdgeTierMap] = None


def get_model() -> GraphModel:
    global _model
    if _model is None:
        _model = parse(TTL_PATH)
    return _model


def get_tier_map() -> EdgeTierMap:
    global _tier_map
    if _tier_map is None:
        _tier_map = classify(get_model(), TierConfig(group_threshold=GROUP_THRESHOLD))
    return _tier_map


# ── Routes ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    """Pre-load graph on startup so first request isn't slow."""
    import time, logging
    log = logging.getLogger("memoria")
    log.info(f"Loading graph from {TTL_PATH}…")
    t0 = time.perf_counter()
    model = get_model()
    get_tier_map()
    elapsed = time.perf_counter() - t0
    log.info(
        f"Graph ready — {len(model.entities)} entities, "
        f"{model.graph.number_of_edges()} edges "
        f"({elapsed:.1f}s)"
    )


@app.get("/suggestions")
def suggestions(top: int = Query(default=20, ge=1, le=100)):
    """Top suggested starting points, ranked by navigability score."""
    scores = compute_scores(get_model(), get_tier_map(), top_n=top)
    model = get_model()
    return [
        {
            "uri": s.uri,
            "label": model.entities[s.uri].label,
            "classes": model.entities[s.uri].classes,
            "note": s.note,
            "score": round(s.score, 4),
        }
        for s in scores
    ]


EDGE_BATCH = 6  # primary edges per stream chunk


@app.get("/scene")
async def scene(
    uri: str = Query(..., description="Focal entity URI"),
    breadcrumb: list[str] = Query(default=[]),
    installation: bool = Query(default=False),
):
    """
    Stream a scene as NDJSON chunks:
      {"type": "meta",    ...focal entity fields...}
      {"type": "edges",   "edges": [...up to EDGE_BATCH edges...]}  (repeated)
      {"type": "grouped", "handles": [...]}
      {"type": "done",    "detail_count": N, "navigation_note": "..."}
    """
    model = get_model()
    tier_map = get_tier_map()

    if uri not in model.entities:
        raise HTTPException(status_code=404, detail=f"Entity not found: {uri}")

    scores = compute_scores(model, tier_map, top_n=len(model.entities))
    nav_note = next((s.note for s in scores if s.uri == uri), None)

    s = generate_scene(
        focal_uri=uri,
        model=model,
        tier_map=tier_map,
        breadcrumb=breadcrumb,
        navigation_note=nav_note,
        installation_mode=installation,
    )

    async def stream():
        # Chunk 1: focal entity metadata — arrives immediately
        yield json.dumps({
            "type": "meta",
            "focal_uri": s.focal_uri,
            "label": s.label,
            "class": s.focal_class,
            "description": s.description,
            "image": s.image,
            "breadcrumb": s.breadcrumb,
            "total_edges": len(s.primary_edges),
        }) + "\n"

        await asyncio.sleep(0)  # yield control so chunk flushes

        # Chunk 2+: primary edges in batches
        for i in range(0, len(s.primary_edges), EDGE_BATCH):
            batch = s.primary_edges[i : i + EDGE_BATCH]
            yield json.dumps({
                "type": "edges",
                "edges": [
                    {
                        "predicate_label": e.predicate_label,
                        "predicate_uri": e.predicate_uri,
                        "target_label": e.target_label,
                        "target_uri": e.target_uri,
                        "target_class": e.target_class,
                    }
                    for e in batch
                ],
            }) + "\n"
            await asyncio.sleep(0)

        # Chunk 3: grouped handles
        yield json.dumps({
            "type": "grouped",
            "handles": [
                {
                    "predicate_label": h.predicate_label,
                    "predicate_uri": h.predicate_uri,
                    "count": h.count,
                    "member_class": h.member_class,
                }
                for h in s.grouped_handles
            ],
        }) + "\n"

        await asyncio.sleep(0)

        # Chunk 4: done
        yield json.dumps({
            "type": "done",
            "detail_count": s.detail_count,
            "navigation_note": nav_note,
        }) + "\n"

    return StreamingResponse(stream(), media_type="application/x-ndjson")


@app.get("/expand")
def expand(
    subject_uri: str = Query(...),
    predicate_uri: str = Query(...),
):
    """
    Expand a grouped handle: returns full member list for
    a given (subject, predicate) pair.
    """
    model = get_model()
    tier_map = get_tier_map()

    if subject_uri not in model.entities:
        raise HTTPException(status_code=404, detail=f"Entity not found: {subject_uri}")

    g = model.graph
    members = []
    for _, target, data in g.out_edges(subject_uri, data=True):
        if data["predicate"] == predicate_uri:
            t_rec = model.entities.get(target)
            t_class = ""
            if t_rec and t_rec.classes:
                t_class = t_rec.classes[0].split("#")[-1].split("/")[-1]
            members.append({
                "uri": target,
                "label": t_rec.label if t_rec else target,
                "class": t_class,
            })

    members.sort(key=lambda m: m["label"])
    return {"subject_uri": subject_uri, "predicate_uri": predicate_uri, "members": members}


@app.get("/search")
def search(q: str = Query(..., min_length=1), limit: int = Query(default=10, ge=1, le=50)):
    """Label autocomplete for the search box."""
    model = get_model()
    q_lower = q.lower()

    results = []
    for uri, rec in model.entities.items():
        if q_lower in rec.label.lower():
            results.append({
                "uri": uri,
                "label": rec.label,
                "classes": [c.split("#")[-1].split("/")[-1] for c in rec.classes],
            })
        if len(results) >= limit * 3:
            break

    # Prefer prefix matches
    results.sort(key=lambda r: (not r["label"].lower().startswith(q_lower), r["label"]))
    return results[:limit]


@app.get("/entity/{uri:path}")
def entity(uri: str):
    """Full entity record."""
    model = get_model()
    rec = model.entities.get(uri)
    if rec is None:
        raise HTTPException(status_code=404, detail=f"Entity not found: {uri}")
    return {
        "uri": rec.uri,
        "label": rec.label,
        "classes": rec.classes,
        "description": rec.description,
        "image": rec.image,
        "has_external_id": rec.has_external_id,
        "label_tier": rec.label_tier,
    }
