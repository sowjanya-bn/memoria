# Memoria — Project Specification
**A domain-agnostic RDF knowledge graph explorer for human-scale navigation**
*The visible memory behind Echo — what the oracle knows, made navigable.*
Version 0.1 — Draft for review

---

## 1. What This Is

Memoria is an interactive application that ingests any RDF/TTL knowledge graph and produces a staged, gesture-ready exploration interface. It does not visualise triples. It transforms a graph into a sequence of navigable scenes — each centred on an entity, each revealing only what is meaningful at that moment.

The primary demo dataset is the Live Aid 1985 knowledge graph. The secondary target is a museum collection knowledge graph, intended for large-screen gesture-based public installation. The architecture must serve both without modification to core logic.

**North star**: a visitor with no prior knowledge walks up to a large screen, reaches out, and discovers a genuine connection in the data they did not know existed. Everything in the system serves that thirty-second moment.

---

## 2. Core Design Principles

**P1 — Stage, don't dump.**
The app never renders the full graph. It renders the graph as experienced from a chosen entity. Expansion is deliberate, not automatic.

**P2 — Navigational honesty.**
The system does not claim to know what is "important." It identifies what is navigationally promising — richly connected, well-labelled, structurally diverse — and says so explicitly. UI language: "Suggested starting points," not "Top entities."

**P3 — Relationship bundling by default.**
High-cardinality homogeneous edges (many same-type objects via a single predicate) are collapsed into summary handles, never rendered individually by default. The visitor sees "Members — 70" before they see 70 nodes. Thresholds are configurable per predicate.

**P4 — Three relationship tiers.**
Every edge in the graph is classified at load time into one of three tiers:
- **Primary** — scene-worthy links: artist → genre, event → venue, performer → performance, object → theme. Rendered immediately.
- **Grouped** — large repeated sets: members, tracks, citations, related items. Rendered as collapsed handles.
- **Detail** — provenance, external identifiers, technical metadata, annotations. Hidden by default, available on request.

**P5 — Legibility as a first-class property.**
The system assesses each entity's readability at load time: label quality, predicate diversity, external identifier presence. This score informs starting-point suggestions and can be surfaced as a graph health summary for admin/debug use.

**P6 — Two modes, one data layer.**
Admin/desktop mode: full navigability diagnostics, predicate browser, triple inspector, health report. Public/installation mode: staged scenes, large touch targets, gesture-safe interaction, no raw data exposed. Both modes read from the same parsed graph model.

---

## 3. System Architecture

```
TTL / SPARQL endpoint
        ↓
[ Ingest & Parse Layer ]
  - RDFLib parse
  - Label resolution pipeline
  - Blank node handling
  - Namespace summary
        ↓
[ Graph Model ]
  - NetworkX in-memory graph
  - Entity index (URI → label, class, tier assignments)
  - Predicate frequency map
  - Cardinality flags per predicate
        ↓
[ Navigability Engine ]
  - Starting point scoring (degree, predicate diversity, label quality, external links)
  - Edge tier classification (primary / grouped / detail)
  - Cardinality bundling (threshold per predicate type)
  - Path suggestion (shortest paths between entities)
        ↓
[ Scene Model ]
  - Scene = focal entity + primary neighbours + grouped handles + detail count
  - Scene sequence = ordered list of scenes for a navigation session
  - Scene metadata = why this entity was suggested
        ↓
[ Render Layer — Desktop ]          [ Render Layer — Installation ]
  Cytoscape.js or React-based          Same scene model
  graph canvas                         Large nodes, dwell-select
  Right panel: entity card             Swipe/gesture navigation
  Predicate filter controls            Minimal UI chrome
  Triple inspector                     No raw data exposed
```

---

## 4. Label Resolution Pipeline

Applied at ingest time, in order of preference:

1. `rdfs:label`
2. `skos:prefLabel`
3. `schema:name`
4. `foaf:name`
5. `dc:title` / `dct:title`
6. URI fragment extraction (`ex:FreddieMercury` → "Freddie Mercury")
7. CURIE compact form
8. Mark as **low-readability** — visible in admin mode, excluded from public starting-point suggestions

For the Live Aid KG: nearly all entities resolve at step 1–3. The pipeline is solved infrastructure, not a design feature.

---

## 5. Edge Tier Classification

Classification is heuristic and configurable. Default rules:

**Primary** edges — predicate connects entities of different semantic classes, both have readable labels, cardinality ≤ configurable threshold (default: 12).

**Grouped** edges — single predicate produces > threshold objects of the same class (e.g. `schema:member` → 70 × Person). Rendered as: `[Members — 70 →]`.

**Detail** edges — predicate is in a known provenance/identifier namespace (`owl:sameAs`, `dct:created`, `oa:hasBody`, `schema:sameAs`, external URIs). Hidden by default.

Tier assignments are overridable via a domain profile (see Section 8).

---

## 6. Navigability Scoring

Each entity receives a navigability score at load time. Score is a weighted composite of:

- **Label quality** — resolved at step 1–3 vs. heuristic vs. low-readability
- **Predicate diversity** — number of distinct predicate types in neighbourhood
- **Degree (normalised)** — total neighbour count, normalised to graph max
- **External identifier presence** — has `owl:sameAs` or `schema:sameAs` pointing to Wikidata, MusicBrainz, etc.
- **Class prominence** — entity is of a class that appears frequently as a subject (not just an object)

Score is used only for starting-point suggestion ranking. It is never exposed as "importance." UI label: "Good place to start — connects many different relation types."

---

## 7. Scene Model

A scene is the unit of exploration. It contains:

```
Scene {
  focal_entity: URI
  label: string
  class: string
  description: string | null
  image: URI | null

  primary_edges: [
    { predicate_label, target_label, target_uri, target_class }
  ]

  grouped_handles: [
    { predicate_label, count, member_class, expand_uri }
  ]

  detail_count: int  // available on request

  navigation_note: string | null  // "Suggested because: connects 4 clusters, has 3 relation types"

  breadcrumb: [URI]  // path taken to reach this scene
}
```

Scene generation is deterministic given a focal entity and a tier configuration. The same scene model is consumed by both the desktop renderer and the installation renderer.

---

## 8. Domain Profiles

A domain profile is a lightweight JSON configuration that adjusts tier thresholds and class visual groupings for a specific KG. It is optional — the system works without one.

Example Live Aid profile:

```json
{
  "name": "Live Aid 1985",
  "primary_classes": ["schema:MusicGroup", "schema:Event", "schema:Place", "mm:MusicEnsemble"],
  "grouped_predicates": {
    "schema:member": { "threshold": 8, "label": "Members" },
    "schema:itemListElement": { "threshold": 5, "label": "Set items" }
  },
  "detail_predicates": ["owl:sameAs", "schema:sameAs", "dct:created", "oa:hasBody"],
  "suggested_entry_points": ["ex:LiveAid1985", "ex:Queen", "ex:WembleyStadium"]
}
```

Museum profile will follow the same structure. Generic mode uses default heuristics.

---

## 9. Interaction Model

### Desktop mode

- Search box → entity autocomplete from label index
- Click entity → load scene
- Click primary edge target → load new scene (breadcrumb appended)
- Click grouped handle → expand handle inline (nodes rendered, handle replaced)
- Click detail count → open triple inspector panel
- Breadcrumb → navigate back
- Predicate filter → toggle tier visibility
- Graph health panel → admin only, shows readability summary

### Installation mode (Leap Motion / gesture)

Gesture vocabulary is minimal and unambiguous. No fine motor precision required.

| Gesture | Action |
|---|---|
| Point / hover + dwell (1.5s) | Select entity / expand handle |
| Swipe left / right | Navigate breadcrumb back / forward |
| Open palm push | Return to starting point suggestions |
| Two-hand spread | Zoom (if 3D renderer used) |
| Fist hold | Focus / highlight selected node |

Installation mode never shows more than 8 primary nodes simultaneously. If a scene would produce more, the lowest-scoring primaries are demoted to a grouped handle automatically.

---

## 10. Build Sequence

### Phase 1 — Working backend (no UI)

- Parse Live Aid TTL with RDFLib
- Build NetworkX graph
- Run label resolution pipeline
- Classify edge tiers
- Compute navigability scores
- Generate scene JSON for a given focal entity URI
- Output: scene JSON to stdout or file, navigability report as text

Deliverable: a Python script that takes a TTL path and an entity URI and returns a valid scene JSON.

### Phase 2 — Desktop explorer

- React frontend consuming scene JSON from a local API
- Cytoscape.js canvas rendering primary edges and grouped handles
- Right panel: entity card (label, class, description, image if present)
- Breadcrumb navigation
- Search with autocomplete
- Expand grouped handles inline
- Toggle detail panel

Deliverable: a working desktop explorer on the Live Aid KG.

### Phase 3 — Installation prototype

- Same backend, same scene model
- New renderer: large nodes, high contrast, minimal chrome
- Leap Motion or mouse-as-hand gesture simulation
- Five scenes maximum per session, then auto-reset
- Demonstrated on Live Aid KG, then museum KG

Deliverable: a demonstrable large-screen prototype for evaluation with real users.

---

## 11. Known Constraints and Open Questions

**Blank nodes in setlists.** The Live Aid KG uses blank nodes as `schema:ListItem` intermediaries inside setlists. These should be transparent to the scene model — the system should follow through them automatically and present the target work directly, not expose the blank node as a navigable entity.

**Santana-class entities.** Any entity with > 15 same-type neighbours via a single predicate will be aggressively bundled. The Santana member list (70 entries) is the reference stress case. Scene generation must not degrade on this entity.

**Museum KG integration.** The museum KG is under active development as a separate project. Memoria should treat it as a second demo dataset in Phase 3, loaded via the same TTL ingest path. No museum-specific logic should enter the core engine.

**Gesture hardware availability.** Leap Motion availability for Phase 3 should be confirmed before Phase 2 begins. If unavailable, mouse-simulation of gestures is an acceptable proof-of-concept substitute for evaluation purposes.

**Evaluation method.** Success for Phase 3 is user-observable: an uninstructed visitor navigates at least two scenes and expresses recognition of a discovered connection. Informal observation is sufficient — this is an application, not a controlled study.

---

## 12. What This Is Not

- Not a triple store or SPARQL query interface
- Not a full graph visualisation (hairball rendering is explicitly out of scope)
- Not a narrative generation system (stories are implied by paths, not generated)
- Not a KG editing tool
- Not dependent on any single KG — Live Aid is the demo, not the product boundary

---

*Spec status: ready for Phase 1 implementation.*
*Next action: build the Python scene generator against the Live Aid TTL.*
