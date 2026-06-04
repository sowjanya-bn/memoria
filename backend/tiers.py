"""
Edge Tier Classification
Classifies every predicate into: primary | grouped | detail
"""
from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Optional

from rdflib.namespace import OWL, DCTERMS
from rdflib import Namespace

from .ingest import GraphModel, DETAIL_NAMESPACES

SCHEMA = Namespace("http://schema.org/")
OA = Namespace("http://www.w3.org/ns/oa#")

# Default cardinality threshold: if a single predicate produces more than this
# many same-class objects from one subject, it becomes a grouped handle.
DEFAULT_GROUP_THRESHOLD = 12

# Predicates always treated as detail regardless of cardinality
ALWAYS_DETAIL_PREDICATES = {
    str(OWL.sameAs),
    str(SCHEMA.sameAs),
    str(DCTERMS.created),
    str(OA.hasBody),
    str(OA.hasTarget),
    str(SCHEMA.identifier),
    str(SCHEMA.subjectOf),
    str(SCHEMA.about),
}


class Tier(str, Enum):
    PRIMARY = "primary"
    GROUPED = "grouped"
    DETAIL = "detail"


@dataclass
class TierConfig:
    group_threshold: int = DEFAULT_GROUP_THRESHOLD
    # predicate URI → forced tier override
    overrides: dict[str, Tier] = field(default_factory=dict)


@dataclass
class EdgeTierMap:
    """
    For each (subject_uri, predicate_uri) pair: resolved Tier.
    A predicate may be primary from one subject but grouped from another
    (e.g. a band with 70 members vs an event with 2 headliners).
    """
    # (subject_uri, predicate_uri) → Tier
    edge_tiers: dict[tuple[str, str], Tier] = field(default_factory=dict)
    # predicate_uri → Tier (global default, used when subject not specified)
    predicate_default_tiers: dict[str, Tier] = field(default_factory=dict)


def _in_detail_namespace(pred_uri: str) -> bool:
    return any(pred_uri.startswith(ns) for ns in DETAIL_NAMESPACES)


def classify(model: GraphModel, config: Optional[TierConfig] = None) -> EdgeTierMap:
    """
    Classify every (subject, predicate) pair in the graph into a tier.
    """
    if config is None:
        config = TierConfig()

    tier_map = EdgeTierMap()
    g = model.graph

    # For each subject, group outgoing edges by predicate
    for node in g.nodes():
        pred_objects: dict[str, list[str]] = {}
        for _, target, data in g.out_edges(node, data=True):
            pred = data["predicate"]
            pred_objects.setdefault(pred, []).append(target)

        for pred, targets in pred_objects.items():
            # Check forced override first
            if pred in config.overrides:
                tier_map.edge_tiers[(node, pred)] = config.overrides[pred]
                continue

            # Always-detail predicates
            if pred in ALWAYS_DETAIL_PREDICATES or _in_detail_namespace(pred):
                tier_map.edge_tiers[(node, pred)] = Tier.DETAIL
                continue

            # Grouped: high cardinality same-class objects via one predicate
            if len(targets) > config.group_threshold:
                tier_map.edge_tiers[(node, pred)] = Tier.GROUPED
                continue

            # Primary: everything else
            tier_map.edge_tiers[(node, pred)] = Tier.PRIMARY

    # Build predicate-level defaults (majority vote across subjects)
    pred_votes: dict[str, dict[Tier, int]] = {}
    for (_, pred), tier in tier_map.edge_tiers.items():
        pred_votes.setdefault(pred, {})
        pred_votes[pred][tier] = pred_votes[pred].get(tier, 0) + 1

    for pred, votes in pred_votes.items():
        tier_map.predicate_default_tiers[pred] = max(votes, key=votes.get)

    return tier_map
