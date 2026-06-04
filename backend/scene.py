"""
Scene Model & Generator
Generates a Scene (the unit of exploration) for a given focal entity URI.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from rdflib import Namespace

from .ingest import GraphModel, _camel_to_words
from .tiers import EdgeTierMap, Tier

SCHEMA = Namespace("http://schema.org/")

# Max primary nodes in installation mode before auto-demotion
INSTALLATION_MAX_PRIMARY = 8


@dataclass
class PrimaryEdge:
    predicate_label: str
    predicate_uri: str
    target_label: str
    target_uri: str
    target_class: str   # first rdf:type or empty string


@dataclass
class GroupedHandle:
    predicate_label: str
    predicate_uri: str
    count: int
    member_class: str
    members: list[dict]  # [{uri, label}] — populated on expand


@dataclass
class Scene:
    focal_uri: str
    label: str
    focal_class: str
    description: Optional[str]
    image: Optional[str]

    primary_edges: list[PrimaryEdge] = field(default_factory=list)
    grouped_handles: list[GroupedHandle] = field(default_factory=list)
    detail_count: int = 0

    navigation_note: Optional[str] = None
    breadcrumb: list[str] = field(default_factory=list)  # URIs

    def to_dict(self) -> dict:
        return {
            "focal_uri": self.focal_uri,
            "label": self.label,
            "class": self.focal_class,
            "description": self.description,
            "image": self.image,
            "primary_edges": [
                {
                    "predicate_label": e.predicate_label,
                    "predicate_uri": e.predicate_uri,
                    "target_label": e.target_label,
                    "target_uri": e.target_uri,
                    "target_class": e.target_class,
                }
                for e in self.primary_edges
            ],
            "grouped_handles": [
                {
                    "predicate_label": h.predicate_label,
                    "predicate_uri": h.predicate_uri,
                    "count": h.count,
                    "member_class": h.member_class,
                    "members": h.members,
                }
                for h in self.grouped_handles
            ],
            "detail_count": self.detail_count,
            "navigation_note": self.navigation_note,
            "breadcrumb": self.breadcrumb,
        }


def _pred_label(pred_uri: str) -> str:
    """Human label for a predicate URI."""
    # Strip namespace, camelCase → words
    if "#" in pred_uri:
        frag = pred_uri.split("#")[-1]
    elif "/" in pred_uri:
        frag = pred_uri.rstrip("/").split("/")[-1]
    else:
        frag = pred_uri
    return _camel_to_words(frag).title()


def generate_scene(
    focal_uri: str,
    model: GraphModel,
    tier_map: EdgeTierMap,
    breadcrumb: Optional[list[str]] = None,
    navigation_note: Optional[str] = None,
    installation_mode: bool = False,
) -> Scene:
    """
    Generate a Scene for the given focal entity URI.
    """
    rec = model.entities.get(focal_uri)
    if rec is None:
        raise ValueError(f"Entity not found in graph: {focal_uri}")

    focal_class = rec.classes[0] if rec.classes else ""
    # Use short class name
    if focal_class:
        focal_class = focal_class.split("#")[-1].split("/")[-1]

    g = model.graph

    # Collect outgoing edges grouped by predicate
    pred_targets: dict[str, list[str]] = {}
    for _, target, data in g.out_edges(focal_uri, data=True):
        pred = data["predicate"]
        pred_targets.setdefault(pred, []).append(target)

    primary_edges: list[PrimaryEdge] = []
    grouped_handles: list[GroupedHandle] = []
    detail_count = 0

    for pred, targets in pred_targets.items():
        tier = tier_map.edge_tiers.get(
            (focal_uri, pred),
            tier_map.predicate_default_tiers.get(pred, Tier.DETAIL),
        )

        if tier == Tier.DETAIL:
            detail_count += len(targets)

        elif tier == Tier.GROUPED:
            # Build a grouped handle
            first_target = model.entities.get(targets[0])
            member_class = ""
            if first_target and first_target.classes:
                member_class = first_target.classes[0].split("#")[-1].split("/")[-1]

            members = []
            for t_uri in targets:
                t_rec = model.entities.get(t_uri)
                members.append({
                    "uri": t_uri,
                    "label": t_rec.label if t_rec else t_uri,
                })

            grouped_handles.append(GroupedHandle(
                predicate_label=_pred_label(pred),
                predicate_uri=pred,
                count=len(targets),
                member_class=member_class,
                members=members,
            ))

        else:  # PRIMARY
            for t_uri in targets:
                t_rec = model.entities.get(t_uri)
                t_label = t_rec.label if t_rec else _camel_to_words(t_uri.split("/")[-1].split("#")[-1])
                t_class = ""
                if t_rec and t_rec.classes:
                    t_class = t_rec.classes[0].split("#")[-1].split("/")[-1]

                primary_edges.append(PrimaryEdge(
                    predicate_label=_pred_label(pred),
                    predicate_uri=pred,
                    target_label=t_label,
                    target_uri=t_uri,
                    target_class=t_class,
                ))

    # Installation mode: cap primaries at INSTALLATION_MAX_PRIMARY
    if installation_mode and len(primary_edges) > INSTALLATION_MAX_PRIMARY:
        # Demote lowest-scored primaries to a grouped handle
        # Simple heuristic: keep first INSTALLATION_MAX_PRIMARY, group the rest
        demoted = primary_edges[INSTALLATION_MAX_PRIMARY:]
        primary_edges = primary_edges[:INSTALLATION_MAX_PRIMARY]
        if demoted:
            grouped_handles.append(GroupedHandle(
                predicate_label="More connections",
                predicate_uri="",
                count=len(demoted),
                member_class="",
                members=[{"uri": e.target_uri, "label": e.target_label} for e in demoted],
            ))

    return Scene(
        focal_uri=focal_uri,
        label=rec.label,
        focal_class=focal_class,
        description=rec.description,
        image=rec.image,
        primary_edges=primary_edges,
        grouped_handles=grouped_handles,
        detail_count=detail_count,
        navigation_note=navigation_note,
        breadcrumb=breadcrumb or [],
    )
