const BASE = import.meta.env.VITE_API_URL || "";

export async function fetchSuggestions(top = 20) {
  const r = await fetch(`${BASE}/suggestions?top=${top}`);
  if (!r.ok) throw new Error("Failed to load suggestions");
  return r.json();
}

/**
 * Stream a scene as NDJSON chunks.
 * onChunk(chunk) is called for each parsed chunk as it arrives.
 * Chunk types: "meta" | "edges" | "grouped" | "done"
 */
export async function streamScene(uri, breadcrumb = [], onChunk) {
  const params = new URLSearchParams({ uri });
  breadcrumb.forEach((b) => params.append("breadcrumb", b));
  const r = await fetch(`${BASE}/scene?${params}`);
  if (!r.ok) throw new Error(`Failed to load scene for ${uri}`);

  const reader = r.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete last line
    for (const line of lines) {
      if (line.trim()) onChunk(JSON.parse(line));
    }
  }
  // flush any remaining
  if (buffer.trim()) onChunk(JSON.parse(buffer));
}

export async function fetchExpand(subjectUri, predicateUri) {
  const params = new URLSearchParams({
    subject_uri: subjectUri,
    predicate_uri: predicateUri,
  });
  const r = await fetch(`${BASE}/expand?${params}`);
  if (!r.ok) throw new Error("Failed to expand handle");
  return r.json();
}

export async function fetchSearch(q, limit = 10) {
  const r = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}&limit=${limit}`);
  if (!r.ok) throw new Error("Search failed");
  return r.json();
}
