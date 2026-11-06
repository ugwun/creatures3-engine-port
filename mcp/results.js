// -------------------------------------------------------------------------
// HTTP and MCP result helpers, kept apart from server.js so they can be
// tested without starting the stdio transport.
// -------------------------------------------------------------------------

// The engine reports many failures as HTTP 200 with {"ok": false, ...} or a
// bare {"error": "..."}. Successful bodies may carry "error": null.
export function engineFailure(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  if (data.ok === false) return typeof data.error === "string" && data.error
    ? data.error
    : "Engine reported failure";
  if (data.ok === undefined && typeof data.error === "string" && data.error)
    return data.error;
  return null;
}

// Throws for non-2xx responses, keeping the engine's own explanation.
export async function readJson(res, label) {
  const body = await res.text();
  let data = null;
  try {
    data = body ? JSON.parse(body) : null;
  } catch (e) {
    if (res.ok) throw new Error(`${label}: invalid JSON response`);
  }
  if (!res.ok) {
    const detail = engineFailure(data) || body.trim().slice(0, 500);
    throw new Error(`${label}: ${res.status} ${res.statusText}` +
      (detail ? ` — ${detail}` : ""));
  }
  return data;
}

export function errorResult(msg) {
  return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
}

// Failure bodies keep their full JSON so position and context fields survive.
export function textResult(data) {
  const text = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  const result = { content: [{ type: "text", text }] };
  if (engineFailure(data)) result.isError = true;
  return result;
}
