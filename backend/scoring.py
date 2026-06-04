"""
Navigability Scoring
Computes a score for each entity indicating how promising it is as a starting point.
Score is never labelled "importance" — only used for "suggested starting points."
"""
from __future__ import annotations

from dataclasses import dataclass

from .ingest import GraphModel
from .tiers import EdgeTierMap, Tier


@dataclass
class NavigabilityScore:
    uri: str
    score: float
    label_quality: float       # 0–1
    predicate_diversity: float # 0–1 normalised
    degree_norm: float         # 0–1 normalised
    has_external_id: float     # 0 or 1
    class_prominence: float    # 0–1
    note: str                  # human-readable explanation


def compute_scores(
    model: GraphModel,
    tier_map: EdgeTierMap,
    top_n: int = 20,
) -> list[NavigabilityScore]:
    """
    Score all entities and return sorted list (highest first).
    Only entities with a readable label (tier ≤ 6) and at least one
    outgoing primary edge are included.
    """
    g = model.graph
    entities = model.entities

    if not g.nodes():
        return []

    max_degree = max((g.out_degree(n) + g.in_degree(n)) for n in g.nodes()) or 1

    # Count how often a URI appears as a subject (class prominence proxy)
    subject_counts = {n: g.out_degree(n) for n in g.nodes()}
    max_subject = max(subject_counts.values()) or 1

    # Pre-compute max distinct predicates across all nodes (used for normalisation)
    max_preds = max(
        (len(set(d["predicate"] for _, _, d in g.out_edges(n, data=True))) for n in g.nodes()),
        default=1,
    ) or 1

    scores: list[NavigabilityScore] = []

    for uri in g.nodes():
        rec = entities.get(uri)
        if rec is None:
            continue

        # Skip low-readability entities as starting points
        if rec.label_tier >= 8:
            continue

        # Label quality: tier 1–3 = high, 4–6 = medium, 7 = low
        if rec.label_tier <= 3:
            lq = 1.0
        elif rec.label_tier <= 6:
            lq = 0.6
        else:
            lq = 0.3

        # Predicate diversity: distinct predicates on outgoing primary edges
        primary_preds = set()
        for _, _, data in g.out_edges(uri, data=True):
            pred = data["predicate"]
            t = tier_map.edge_tiers.get((uri, pred),
                tier_map.predicate_default_tiers.get(pred, Tier.DETAIL))
            if t == Tier.PRIMARY:
                primary_preds.add(pred)

        if not primary_preds:
            continue  # no primary edges → not a useful starting point

        pd_norm = len(primary_preds) / max_preds

        # Degree
        deg = g.out_degree(uri) + g.in_degree(uri)
        deg_norm = deg / max_degree

        # External id
        ext = 1.0 if rec.has_external_id else 0.0

        # Class prominence
        cp = subject_counts.get(uri, 0) / max_subject

        score = (
            0.30 * lq +
            0.25 * pd_norm +
            0.20 * deg_norm +
            0.15 * ext +
            0.10 * cp
        )

        note_parts = []
        if len(primary_preds) > 1:
            note_parts.append(f"connects {len(primary_preds)} relation types")
        if rec.has_external_id:
            note_parts.append("has external identifiers")
        if deg > 10:
            note_parts.append(f"highly connected ({deg} links)")

        note = "Good place to start"
        if note_parts:
            note += " — " + ", ".join(note_parts)

        scores.append(NavigabilityScore(
            uri=uri,
            score=score,
            label_quality=lq,
            predicate_diversity=pd_norm,
            degree_norm=deg_norm,
            has_external_id=ext,
            class_prominence=cp,
            note=note,
        ))

    scores.sort(key=lambda s: s.score, reverse=True)
    return scores[:top_n]
