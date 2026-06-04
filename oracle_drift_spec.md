# Oracle Drift — Enhancement Specification
**Memoria Phase 4: Ambient semantic visualisation during Echo's reasoning**
*The fever dream of the knowledge graph while the oracle thinks.*
Version 0.1 — Backlog / Post-Phase 3

---

## 1. What This Is

Oracle Drift is an ambient display mode for Memoria that activates while Echo is processing a visitor query. Instead of a static screen or a loading spinner, the knowledge graph behind Echo becomes briefly, beautifully visible — pulsing with the entities Echo is actually retrieving, tracing the paths it is genuinely considering, settling into stillness when Echo speaks.

It is not a simulation of thinking. It is a live trace of semantic retrieval made visible.

**One rule above all others**: Oracle Drift must only animate what Echo is actually touching. No invented busyness. No decorative graph noise. Every pulsing node, every glowing path, every fading cluster must correspond to a real URI being retrieved from the KG during that inference pass. The theatricality is earned by the truth of the data.

---

## 2. The Two Modes of Memoria

| Mode | Trigger | Behaviour |
|---|---|---|
| **Navigation mode** | Default / visitor interaction | Staged scene exploration, gesture navigation, entity cards |
| **Oracle Drift mode** | Echo begins processing | Ambient animation of active KG retrieval, paths emerging and fading, settles on final entities when Echo responds |

Transition between modes should be smooth — Navigation mode does not hard-cut to Oracle Drift. The current scene softens, the graph breathes outward, drift begins.

---

## 3. Signal Architecture

Oracle Drift requires a minimal shared signal contract between Echo and Memoria.

Echo emits events at key moments during inference:

```json
{
  "event": "retrieval_start",
  "query_text": "Why was Queen's performance so remembered?",
  "timestamp": "..."
}

{
  "event": "entity_activated",
  "uri": "ex:Queen",
  "confidence": 0.91,
  "timestamp": "..."
}

{
  "event": "path_considered",
  "path": ["ex:Queen", "ex:WembleyStadium", "ex:RadioGaGa", "ex:AudienceParticipation"],
  "timestamp": "..."
}

{
  "event": "retrieval_complete",
  "focal_entities": ["ex:Queen", "ex:WembleyStadium", "ex:RadioGaGa"],
  "timestamp": "..."
}
```

Memoria listens on a local event stream (WebSocket or simple pub/sub). It animates only what the signal contains. No signal, no animation.

This contract is the only integration point between Echo and Memoria. Echo does not need to know anything about Memoria's rendering. Memoria does not need to know anything about Echo's language model.

---

## 4. Visual Behaviour

### Retrieval start
- Current Navigation scene softens: nodes reduce opacity to ~30%, labels fade
- Background activates: slow dark pulse, graph field becomes visible at low opacity
- Atmosphere: the graph is waking up

### Entity activated
- Corresponding node brightens sharply, then holds a steady glow
- Pulse radiates outward one hop — neighbours become faintly visible
- Multiple activated entities can glow simultaneously
- Confidence score maps to glow intensity (high confidence = brighter, more stable)

### Path considered
- Path edges illuminate in sequence, node to node, with a brief travel animation
- Path fades after ~3 seconds if not reinforced by further signals
- Multiple candidate paths can appear and fade simultaneously — this is the fever dream moment
- Paths that share edges with other considered paths reinforce each other visually

### Retrieval complete
- Non-focal entities fade out
- Focal entities stabilise: full brightness, labels fully visible
- Graph gently contracts toward focal cluster
- Memoria transitions back toward Navigation mode centred on the focal entities
- Echo speaks

### Echo speaking
- Full return to Navigation mode
- Scene now centred on the entities Echo just discussed
- Visitor can immediately begin navigating from that point

---

## 5. Design Constraints

**No hallucination.** The system must not animate entities or paths that Echo did not retrieve. A decorative graph that looks busy but is disconnected from actual inference would be dishonest and, if noticed, damaging to trust in both systems.

**Legibility at distance.** Oracle Drift runs on the same large screen as Navigation mode. Node labels during drift can be smaller and more ephemeral than in navigation mode, but focal entities at retrieval_complete must be fully legible at 2 metres.

**Graceful degradation.** If Echo's signal stream drops or delays, Memoria should not freeze. A gentle idle animation — slow ambient breathing of the last known scene — is preferable to a static or broken state.

**Re-entry.** After Oracle Drift completes, the visitor should be able to continue navigating from wherever Echo landed. The transition from drift to navigation must feel like arrival, not interruption.

---

## 6. What This Is Not

- Not a visualisation of the language model's internal state (that is inaccessible and would be misleading)
- Not a fake loading animation dressed as a knowledge graph
- Not a continuous background effect (it activates only during Echo's processing window)
- Not a replacement for Navigation mode — it is a temporary, beautiful interruption of it

---

## 7. Build Dependencies

Oracle Drift cannot be built until:

- Memoria Phase 1 is complete (scene model and graph parser)
- Memoria Phase 3 is complete (installation renderer with large-screen layout)
- Echo's inference pipeline can emit URI-level retrieval events (requires Echo-side instrumentation)

The Echo signal contract should be agreed before Phase 3 ends so that the event hooks can be stubbed in during installation renderer development, even if Oracle Drift itself is not yet active.

---

## 8. Prototype Scope

For a first proof-of-concept, full signal fidelity from Echo is not required. A stub emitter that replays a pre-recorded retrieval sequence against the Live Aid KG is sufficient to validate the visual behaviour. Demo sequence:

```
Query: "Why was Queen's performance so remembered?"

t=0.0s  retrieval_start
t=0.3s  entity_activated: ex:Queen (0.95)
t=0.6s  entity_activated: ex:WembleyStadium (0.87)
t=0.9s  path_considered: Queen → Wembley → RadioGaGa → AudienceParticipation
t=1.4s  path_considered: Queen → FreddieMercury → CrowdEngagement → Legacy
t=2.1s  entity_activated: ex:RadioGaGa (0.82)
t=2.8s  entity_activated: ex:HammerToFall_CameramanMoment (0.61)
t=3.5s  retrieval_complete: [Queen, WembleyStadium, RadioGaGa]
```

This sequence can be triggered manually during a demo and is sufficient to evaluate whether the visual behaviour works as intended.

---

## 9. Name

**Oracle Drift.** Not Memory Drift, not Thinking View, not Dream Trace. Oracle Drift names the thing precisely: it is the drift of the oracle's attention through memory, visible for a moment before it resolves into speech.

---

*Spec status: backlog — begin after Memoria Phase 3 is complete and Echo signal contract is agreed.*
*Next action: stub the WebSocket event contract into Memoria Phase 3 renderer so hooks exist when needed.*
