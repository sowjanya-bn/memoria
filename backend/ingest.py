"""
Ingest & Parse Layer
Parses any RDF/TTL file into an in-memory graph model.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

import networkx as nx
from rdflib import ConjunctiveGraph, Graph, Namespace, URIRef, BNode, Literal
from rdflib.namespace import RDF, RDFS, OWL, SKOS, DC, DCTERMS, FOAF

SCHEMA = Namespace("http://schema.org/")

# Label predicates in preference order
LABEL_PREDICATES = [
    RDFS.label,
    SKOS.prefLabel,
    SCHEMA.name,
    FOAF.name,
    DC.title,
    DCTERMS.title,
]

# Predicates that signal external identity links
EXTERNAL_ID_PREDICATES = {OWL.sameAs, SCHEMA.sameAs}

# Predicates that should be treated as "detail" by default
DETAIL_NAMESPACES = {
    str(OWL),          # owl:sameAs etc.
    str(DCTERMS),      # dct:created etc.
    "http://www.w3.org/ns/oa#",   # oa:hasBody etc.
}

# Predicates used to thread through blank nodes in list structures
LIST_ITEM_PREDICATES = {SCHEMA.itemListElement}
LIST_ITEM_TARGET = SCHEMA.item


@dataclass
class EntityRecord:
    uri: str
    label: str
    label_tier: int          # 1–6 from pipeline, 7 = heuristic, 8 = low
    classes: list[str] = field(default_factory=list)
    description: Optional[str] = None
    image: Optional[str] = None
    has_external_id: bool = False


@dataclass
class GraphModel:
    graph: nx.MultiDiGraph
    entities: dict[str, EntityRecord]       # uri → record
    predicate_freq: dict[str, int]          # pred_uri → count
    # predicate → set of object classes (for cardinality analysis)
    pred_object_classes: dict[str, dict[str, int]]


def _label_from_uri(uri: str) -> tuple[str, int]:
    """Extract a human-readable label from a URI. Returns (label, tier)."""
    # Try fragment
    if "#" in uri:
        frag = uri.split("#")[-1]
        label = _camel_to_words(frag)
        return label, 7
    # Try last path segment
    if "/" in uri:
        seg = uri.rstrip("/").split("/")[-1]
        label = _camel_to_words(seg)
        return label, 7
    return uri, 8


def _camel_to_words(s: str) -> str:
    """FreddieMercury → Freddie Mercury, LiveAid1985 → Live Aid 1985"""
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", s)
    s = re.sub(r"([A-Z]+)([A-Z][a-z])", r"\1 \2", s)
    s = re.sub(r"_", " ", s)
    return s.strip()


def _short_pred_label(pred_uri: str, g: Graph) -> str:
    """Best human label for a predicate URI."""
    for label_pred in LABEL_PREDICATES:
        for val in g.objects(URIRef(pred_uri), label_pred):
            if isinstance(val, Literal):
                return str(val)
    label, _ = _label_from_uri(pred_uri)
    return label


def _resolve_label(uri: URIRef, g: Graph) -> tuple[str, int]:
    """Run the label resolution pipeline for an entity. Returns (label, tier)."""
    for tier, pred in enumerate(LABEL_PREDICATES, start=1):
        for val in g.objects(uri, pred):
            if isinstance(val, Literal) and str(val).strip():
                return str(val).strip(), tier
    # Heuristic from URI
    return _label_from_uri(str(uri))


def _resolve_classes(uri: URIRef, g: Graph) -> list[str]:
    return [str(o) for o in g.objects(uri, RDF.type) if isinstance(o, URIRef)]


def _follow_blank_node_list(bnode: BNode, g: Graph) -> Optional[URIRef]:
    """Follow schema:ListItem blank node → schema:item target."""
    for target in g.objects(bnode, LIST_ITEM_TARGET):
        if isinstance(target, URIRef):
            return target
    return None


def parse(ttl_path: str) -> GraphModel:
    """Parse a TTL file and return a GraphModel."""
    rdf_graph = Graph()
    rdf_graph.parse(ttl_path, format="turtle")

    nx_graph = nx.MultiDiGraph()
    entities: dict[str, EntityRecord] = {}
    predicate_freq: dict[str, int] = {}
    pred_object_classes: dict[str, dict[str, int]] = {}

    # Collect all non-blank subjects to build entity index
    all_subjects: set[URIRef] = set()
    all_objects_uri: set[URIRef] = set()

    for s, p, o in rdf_graph:
        if isinstance(s, URIRef):
            all_subjects.add(s)
        if isinstance(o, URIRef):
            all_objects_uri.add(o)

    all_uris = all_subjects | all_objects_uri

    for uri in all_uris:
        label, tier = _resolve_label(uri, rdf_graph)
        classes = _resolve_classes(uri, rdf_graph)

        description = None
        for val in rdf_graph.objects(uri, SCHEMA.description):
            if isinstance(val, Literal):
                description = str(val)
                break

        image = None
        for val in rdf_graph.objects(uri, SCHEMA.image):
            if isinstance(val, URIRef):
                image = str(val)
                break

        has_external_id = any(
            rdf_graph.objects(uri, p) for p in EXTERNAL_ID_PREDICATES
        )

        entities[str(uri)] = EntityRecord(
            uri=str(uri),
            label=label,
            label_tier=tier,
            classes=classes,
            description=description,
            image=image,
            has_external_id=has_external_id,
        )

    # Build NetworkX graph edges, resolving blank nodes transparently
    for s, p, o in rdf_graph:
        if not isinstance(s, URIRef):
            continue  # skip blank node subjects at top level

        pred_str = str(p)
        predicate_freq[pred_str] = predicate_freq.get(pred_str, 0) + 1

        if isinstance(o, BNode):
            # Check if this is a list item blank node — follow through
            if p in LIST_ITEM_PREDICATES:
                target = _follow_blank_node_list(o, rdf_graph)
                if target:
                    nx_graph.add_edge(str(s), str(target), predicate=pred_str)
                    # Track object class distribution
                    obj_classes = _resolve_classes(target, rdf_graph)
                    cls_key = obj_classes[0] if obj_classes else "_unknown"
                    pred_object_classes.setdefault(pred_str, {})
                    pred_object_classes[pred_str][cls_key] = (
                        pred_object_classes[pred_str].get(cls_key, 0) + 1
                    )
            # Other blank nodes: skip (detail/provenance)

        elif isinstance(o, URIRef):
            nx_graph.add_edge(str(s), str(o), predicate=pred_str)
            obj_classes = _resolve_classes(o, rdf_graph)
            cls_key = obj_classes[0] if obj_classes else "_unknown"
            pred_object_classes.setdefault(pred_str, {})
            pred_object_classes[pred_str][cls_key] = (
                pred_object_classes[pred_str].get(cls_key, 0) + 1
            )

        # Literals: not added as graph edges (they inform entity records only)

    return GraphModel(
        graph=nx_graph,
        entities=entities,
        predicate_freq=predicate_freq,
        pred_object_classes=pred_object_classes,
    )
