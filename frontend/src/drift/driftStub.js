/**
 * Oracle Drift — growing graph journey (slow, cinematic)
 */

export const JOURNEY = [
  // ── Act I: Live Aid 1985 ───────────────────────────────────────────────
  { t: 0,    event: "label",  text: "Live Aid 1985 — Wembley Stadium, 13 July 1985" },
  { t: 0,    event: "expand", uri: "http://wembrewind.live/ex#LiveAid1985" },
  { t: 1200, event: "zoom",   uri: "http://wembrewind.live/ex#LiveAid1985", level: 0.7 },
  { t: 1800, event: "pulse",  uri: "http://wembrewind.live/ex#LiveAid1985", confidence: 0.95 },

  // ── Drift toward Queen ─────────────────────────────────────────────────
  { t: 3500, event: "label",  text: "Following the thread to Queen…" },
  { t: 3800, event: "trace",  path: [
      "http://wembrewind.live/ex#LiveAid1985",
      "http://wembrewind.live/ex#Queen",
  ]},

  // ── Act II: Expand Queen ───────────────────────────────────────────────
  { t: 5500,  event: "label",  text: "Queen — British rock band, formed 1970" },
  { t: 5500,  event: "fadeRing", exceptUri: "http://wembrewind.live/ex#Queen" },
  { t: 5500,  event: "expand", uri: "http://wembrewind.live/ex#Queen" },
  { t: 6800,  event: "fit" },
  { t: 7000,  event: "zoom",   uri: "http://wembrewind.live/ex#Queen", level: 0.65 },
  { t: 7800,  event: "pulse",  uri: "http://wembrewind.live/ex#Queen", confidence: 0.98 },
  { t: 8400,  event: "pulse",  uri: "http://wembrewind.live/ex#FreddieMercury", confidence: 0.82 },

  // ── Drift toward Performance ───────────────────────────────────────────
  { t: 10000, event: "label",  text: "Finding the Live Aid performance…" },
  { t: 10300, event: "trace",  path: [
      "http://wembrewind.live/ex#Queen",
      "http://wembrewind.live/ex#Queen_LiveAid1985_Performance",
  ]},

  // ── Act III: Queen's Performance ──────────────────────────────────────
  { t: 12200, event: "label",  text: "Queen's Live Aid Performance" },
  { t: 12200, event: "fadeRing", exceptUri: "http://wembrewind.live/ex#Queen_LiveAid1985_Performance" },
  { t: 12200, event: "expand", uri: "http://wembrewind.live/ex#Queen_LiveAid1985_Performance" },
  { t: 13800, event: "fit" },
  { t: 14000, event: "zoom",   uri: "http://wembrewind.live/ex#Queen_LiveAid1985_Performance", level: 0.6 },
  { t: 14800, event: "pulse",  uri: "http://wembrewind.live/ex#Queen_LiveAid1985_Performance", confidence: 0.99 },

  // ── Settle ─────────────────────────────────────────────────────────────
  { t: 16500, event: "label",  text: "Retrieval complete" },
  { t: 16500, event: "settle", uris: [
      "http://wembrewind.live/ex#Queen_LiveAid1985_Performance",
      "http://wembrewind.live/ex#Queen",
      "http://wembrewind.live/ex#WembleyStadium",
      "http://wembrewind.live/ex#LiveAid1985",
  ]},
  { t: 17000, event: "fit" },
];

export function playDriftSequence(onEvent) {
  const timers = JOURNEY.map(({ t, ...event }) =>
    setTimeout(() => onEvent(event), t)
  );
  return () => timers.forEach(clearTimeout);
}
