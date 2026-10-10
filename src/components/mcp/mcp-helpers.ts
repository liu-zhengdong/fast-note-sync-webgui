export interface MCPTokenOptions {
  writeNotes: boolean;
  files: "none" | "read" | "write";
  allVaults: boolean;
  vaults: string[];
  expiredDays: number;
}

export function buildMCPTokenScope(options: MCPTokenOptions) {
  if (!Number.isInteger(options.expiredDays) || options.expiredDays < 1) throw new Error("expiry");
  const vaults = [...new Set(options.vaults)];
  if (!options.allVaults && vaults.length === 0) throw new Error("vaults");
  // The token API represents unrestricted vault access with an empty string.
  // Only an explicit allVaults choice may produce it.
  if (!options.allVaults && vaults.some(vault => !vault.trim() || vault.includes(",") || vault === "*")) throw new Error("vaults");
  const functions = [options.writeNotes ? "note_rw" : "note_r"];
  if (options.files !== "none") functions.push(options.files === "write" ? "file_rw" : "file_r");
  return { protocol: "mcp", client: "*", functionScope: functions.join(","), vaults: options.allVaults ? "" : vaults.join(","), expiredDays: options.expiredDays };
}

export function resolveMCPEndpoint(apiUrl: string, pageUrl: string): string {
  const url = new URL(`${apiUrl.replace(/\/+$/, "")}/api/mcp`, pageUrl);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error("endpoint");
  return url.href;
}

export function mcpConfigSnippet(endpoint: string): string {
  return JSON.stringify({ mcpServers: { "fast-note-sync": { url: endpoint, headers: { Authorization: "Bearer <MCP_TOKEN>" } } } }, null, 2);
}

export type MCPErrorKind = "http" | "auth" | "forbidden" | "application" | "rpc" | "invalidResponse" | "timeout" | "network" | "token";
export class MCPConnectionError extends Error {
  constructor(public kind: MCPErrorKind, public code?: number) { super(kind); }
}

type RPCResponse = { jsonrpc: "2.0"; id: number; result?: unknown; error?: { code: number } };
function rpcResult(value: unknown, id: number): unknown {
  if (!value || typeof value !== "object") throw new MCPConnectionError("invalidResponse");
  // FNS auth middleware can return a failure envelope with HTTP 200 before JSON-RPC.
  // Keep only its numeric code; messages and details may contain credentials or paths.
  if (!("jsonrpc" in value) && "status" in value && value.status === false && "code" in value && typeof value.code === "number" && Number.isSafeInteger(value.code) && value.code >= 0) {
    const code = value.code;
    const kind = code >= 306 && code <= 310 ? "auth" : code >= 312 && code <= 315 ? "forbidden" : "application";
    throw new MCPConnectionError(kind, code);
  }
  const response = value as RPCResponse;
  if (response.jsonrpc !== "2.0" || response.id !== id) throw new MCPConnectionError("invalidResponse");
  if (response.error) throw new MCPConnectionError("rpc", typeof response.error.code === "number" ? response.error.code : undefined);
  if (!("result" in response)) throw new MCPConnectionError("invalidResponse");
  return response.result;
}

function parseJSON(text: string): unknown {
  try { return JSON.parse(text); } catch { throw new MCPConnectionError("invalidResponse"); }
}

// Consume until the matching response, then cancel: SSE streams need not close.
export async function readMCPResult(response: Response, id: number): Promise<unknown> {
  if (!response.ok) throw new MCPConnectionError("http", response.status);
  if (!response.headers.get("Content-Type")?.includes("text/event-stream")) return rpcResult(parseJSON(await response.text()), id);
  if (!response.body) throw new MCPConnectionError("invalidResponse");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      // Normalize line endings after accumulating chunks, including split CRLF.
      const normalized = buffer.replace(/\r\n/g, "\n");
      const blocks = normalized.split("\n\n");
      buffer = blocks.pop() || "";
      if (done && buffer.trim()) { blocks.push(buffer); buffer = ""; }
      for (const block of blocks) {
        const data = block.split("\n").filter(line => line.startsWith("data:")).map(line => line.slice(5).replace(/^ /, "")).join("\n");
        if (!data) continue;
        const payload = parseJSON(data);
        if (payload && typeof payload === "object" && "id" in payload && payload.id === id) return rpcResult(payload, id);
      }
      if (buffer.length > 1_000_000) throw new MCPConnectionError("invalidResponse");
      if (done) throw new MCPConnectionError("invalidResponse");
    }
  } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

export interface MCPTestResult { serverName: string; protocolVersion: string; tools: string[] }
export async function testMCPConnection(endpoint: string, token: string, headers: Record<string, string>, options: { fetcher?: typeof fetch; timeoutMs?: number; signal?: AbortSignal } = {}): Promise<MCPTestResult> {
  if (!token.trim()) throw new MCPConnectionError("token");
  const controller = new AbortController();
  const abort = () => controller.abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  if (options.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, options.timeoutMs ?? 15000);
  const fetcher = options.fetcher ?? fetch;
  let session: string | null = null;
  let version = "2025-03-26";
  const post = (body: object) => fetcher(endpoint, {
    method: "POST", signal: controller.signal, credentials: "omit", redirect: "error",
    headers: { ...headers, Authorization: `Bearer ${token.trim()}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": version, ...(session ? { "Mcp-Session-Id": session } : {}) },
    body: JSON.stringify(body),
  });
  try {
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: version, capabilities: {}, clientInfo: { name: "Fast Note Sync WebGUI", version: "1.0.0" } } });
    session = init.headers.get("Mcp-Session-Id");
    const initialized = await readMCPResult(init, 1);
    if (!initialized || typeof initialized !== "object" || !("protocolVersion" in initialized) || typeof initialized.protocolVersion !== "string" || !("serverInfo" in initialized) || !initialized.serverInfo || typeof initialized.serverInfo !== "object" || !("name" in initialized.serverInfo) || typeof initialized.serverInfo.name !== "string") throw new MCPConnectionError("invalidResponse");
    version = initialized.protocolVersion;
    if (!["2024-11-05", "2025-03-26", "2025-06-18", "2025-11-25"].includes(version)) throw new MCPConnectionError("invalidResponse");
    const notified = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    if (!notified.ok) throw new MCPConnectionError("http", notified.status);
    await notified.body?.cancel();
    const tools: string[] = [];
    let cursor: string | undefined;
    const cursors = new Set<string>();
    do {
      const listed = await readMCPResult(await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: cursor ? { cursor } : {} }), 2);
      if (!listed || typeof listed !== "object" || !("tools" in listed) || !Array.isArray(listed.tools) || listed.tools.some(tool => !tool || typeof tool.name !== "string")) throw new MCPConnectionError("invalidResponse");
      tools.push(...listed.tools.map(tool => tool.name as string));
      cursor = "nextCursor" in listed ? listed.nextCursor as string | undefined : undefined;
      if (cursor && (typeof cursor !== "string" || cursors.has(cursor) || cursors.size >= 100)) throw new MCPConnectionError("invalidResponse");
      if (cursor) cursors.add(cursor);
    } while (cursor);
    return { serverName: initialized.serverInfo.name, protocolVersion: version, tools };
  } catch (error) {
    if (controller.signal.aborted) throw new MCPConnectionError("timeout");
    if (error instanceof MCPConnectionError) throw error;
    // Do not expose server bodies, URLs, or exception messages that may contain credentials.
    throw new MCPConnectionError("network");
  } finally { clearTimeout(timer); options.signal?.removeEventListener("abort", abort); }
}
