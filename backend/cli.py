"""
Memoria CLI — Phase 1
Usage:
  # Generate a scene for a specific entity:
  python -m backend.cli path/to/graph.ttl <entity_uri>

  # List suggested starting points (navigability report):
  python -m backend.cli path/to/graph.ttl --report

  # Both:
  python -m backend.cli path/to/graph.ttl <entity_uri> --report
"""
from __future__ import annotations

import argparse
import json
import sys

from .ingest import parse
from .tiers import classify, TierConfig
from .scoring import compute_scores
from .scene import generate_scene


def build_argparser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog="memoria",
        description="Memoria Phase 1 — RDF knowledge graph scene generator",
    )
    p.add_argument("ttl", help="Path to the TTL file")
    p.add_argument(
        "entity",
        nargs="?",
        help="Focal entity URI (e.g. http://wembrewind.live/ex#Queen)",
    )
    p.add_argument(
        "--report",
        action="store_true",
        help="Print navigability report (top suggested starting points)",
    )
    p.add_argument(
        "--top",
        type=int,
        default=10,
        help="Number of starting points to show in the report (default: 10)",
    )
    p.add_argument(
        "--group-threshold",
        type=int,
        default=12,
        help="Cardinality threshold for grouped handles (default: 12)",
    )
    p.add_argument(
        "--out",
        help="Write scene JSON to this file instead of stdout",
    )
    p.add_argument(
        "--installation",
        action="store_true",
        help="Use installation mode (max 8 primary nodes per scene)",
    )
    return p


def main() -> None:
    args = build_argparser().parse_args()

    print("Parsing graph…", file=sys.stderr)
    model = parse(args.ttl)
    print(
        f"  {len(model.entities)} entities, "
        f"{model.graph.number_of_edges()} edges, "
        f"{len(model.predicate_freq)} predicates",
        file=sys.stderr,
    )

    config = TierConfig(group_threshold=args.group_threshold)
    tier_map = classify(model, config)

    if args.report or args.entity is None:
        scores = compute_scores(model, tier_map, top_n=args.top)
        print("\n── Suggested starting points ──", file=sys.stderr)
        for i, s in enumerate(scores, 1):
            rec = model.entities[s.uri]
            classes = ", ".join(
                c.split("#")[-1].split("/")[-1] for c in rec.classes
            ) or "—"
            print(
                f"  {i:2}. {rec.label:<35} [{classes}]",
                file=sys.stderr,
            )
            print(f"      {s.note}", file=sys.stderr)
        print("", file=sys.stderr)

        if args.entity is None:
            return

    entity_uri = args.entity

    # Friendly: accept short form like "ex:Queen"
    if entity_uri.startswith("ex:"):
        entity_uri = "http://wembrewind.live/ex#" + entity_uri[3:]

    if entity_uri not in model.entities:
        # Try prefix-expand against known namespaces
        print(f"Entity not found: {entity_uri}", file=sys.stderr)
        # Suggest close matches
        label_lower = entity_uri.lower()
        matches = [
            (uri, rec.label)
            for uri, rec in model.entities.items()
            if label_lower in rec.label.lower() or label_lower in uri.lower()
        ]
        if matches:
            print("Did you mean:", file=sys.stderr)
            for uri, label in matches[:5]:
                print(f"  {uri}  ({label})", file=sys.stderr)
        sys.exit(1)

    rec = model.entities[entity_uri]
    nav_note = None
    # Pull note from scores if entity is in the top list
    scores = compute_scores(model, tier_map, top_n=len(model.entities))
    for s in scores:
        if s.uri == entity_uri:
            nav_note = s.note
            break

    scene = generate_scene(
        focal_uri=entity_uri,
        model=model,
        tier_map=tier_map,
        navigation_note=nav_note,
        installation_mode=args.installation,
    )

    output = json.dumps(scene.to_dict(), indent=2, ensure_ascii=False)

    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"Scene written to {args.out}", file=sys.stderr)
    else:
        print(output)


if __name__ == "__main__":
    main()
