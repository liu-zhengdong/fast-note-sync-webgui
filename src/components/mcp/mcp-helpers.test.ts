import { describe, expect, it, vi } from "vitest";
import { buildMCPTokenScope, mcpConfigSnippet, readMCPResult, resolveMCPEndpoint, testMCPConnection } from "./mcp-helpers";

const base = { writeNotes: false, files: "none" as const, allVaults: false, vaults: ["Notes"], expiredDays: 30 };
const json = (id: number, result: unknown, headers = {}) => new Response(JSON.stringify({ jsonrpc: "2.0", id, result }), { headers: { "Content-Type": "application/json", ...headers } });

describe("MCP token scope", () => {
  it("defaults to MCP-only note read and selected named vaults", () => {
    expect(buildMCPTokenScope(base)).toEqual({ protocol: "mcp", client: "*", functionScope: "note_r", vaults: "Notes", expiredDays: 30 });
  });
  it("refuses an empty selection unless all vaults is explicitly chosen", () => {
    expect(() => buildMCPTokenScope({ ...base, vaults: [] })).toThrow("vaults");
    expect(buildMCPTokenScope({ ...base, allVaults: true, vaults: [] }).vaults).toBe("");
    for (const vault of [" ", "*", "one,two"]) expect(() => buildMCPTokenScope({ ...base, vaults: [vault] })).toThrow("vaults");
  });
  it("encodes optional write/files and validates expiry", () => {
    expect(buildMCPTokenScope({ ...base, writeNotes: true, files: "write" }).functionScope).toBe("note_rw,file_rw");
    expect(buildMCPTokenScope({ ...base, files: "read" }).functionScope).toBe("note_r,file_r");
    for (const days of [0, -1, NaN, 1.5]) expect(() => buildMCPTokenScope({ ...base, expiredDays: days })).toThrow("expiry");
  });
  it("resolves API paths and uses only a safe token placeholder", () => {
    expect(resolveMCPEndpoint("/service/", "https://notes.test/settings")).toBe("https://notes.test/service/api/mcp");
    expect(resolveMCPEndpoint("https://api.test", "https://notes.test")).toBe("https://api.test/api/mcp");
    expect(mcpConfigSnippet("https://api.test/api/mcp")).toContain("Bearer <MCP_TOKEN>");
  });
});

describe("MCP connection protocol", () => {
  it("initializes then lists tools, propagating session and negotiated version without any tools/call", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(1, { protocolVersion: "2025-03-26", serverInfo: { name: "Notes" } }, { "Mcp-Session-Id": "session" })).mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(json(2, { tools: [{ name: "read_note" }] }));
    expect(await testMCPConnection("https://notes.test/api/mcp", "secret", {}, { fetcher })).toEqual({ serverName: "Notes", protocolVersion: "2025-03-26", tools: ["read_note"] });
    expect(fetcher.mock.calls.map(call => JSON.parse(call[1].body).method)).toEqual(["initialize", "notifications/initialized", "tools/list"]);
    expect(fetcher.mock.calls[1][1].headers["Mcp-Session-Id"]).toBe("session");
    expect(fetcher.mock.calls[2][1].headers.Authorization).toBe("Bearer secret");
    expect(fetcher.mock.calls[0][1].redirect).toBe("error");
  });
  it("parses streamed SSE with notification events and cancels an open stream after the response", async () => {
    let cancelled = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode('data: {"jsonrpc":"2.0","method":"notifications/progress"}\r\n\r\n'));
      controller.enqueue(encoder.encode('data: {"jsonrpc":"2.0","id":2,"result":{"tools":[]}}\r'));
      controller.enqueue(encoder.encode('\n\r\n'));
    }, cancel() { cancelled = true; } });
    expect(await readMCPResult(new Response(stream, { headers: { "Content-Type": "text/event-stream" } }), 2)).toEqual({ tools: [] });
    expect(cancelled).toBe(true);
  });
  it("reports HTTP, RPC and malformed responses without exposing response bodies", async () => {
    await expect(readMCPResult(new Response("token=secret", { status: 401 }), 1)).rejects.toMatchObject({ kind: "http", code: 401, message: "http" });
    await expect(readMCPResult(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "secret" } })), 1)).rejects.toMatchObject({ kind: "rpc", code: -32602, message: "rpc" });
    await expect(readMCPResult(json(99, {}), 1)).rejects.toMatchObject({ kind: "invalidResponse" });
    await expect(readMCPResult(new Response("not json"), 1)).rejects.toMatchObject({ kind: "invalidResponse" });
  });
  it.each([
    [306, "auth"], [307, "auth"], [308, "auth"], [309, "auth"], [310, "auth"],
    [312, "forbidden"], [313, "forbidden"], [314, "forbidden"], [315, "forbidden"],
    [300, "application"],
  ])("classifies HTTP 200 FNS failure code %i as %s without retaining server content", async (code, kind) => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: false, code, message: "server-secret", details: "private-vault", data: { token: "response-token" } }), { headers: { "Content-Type": "application/json" } }));
    const error = await testMCPConnection("https://notes.test/api/mcp", "wrong-token", {}, { fetcher }).catch(error => error);
    expect(error).toMatchObject({ kind, code, message: kind });
    expect(fetcher).toHaveBeenCalledTimes(1);
    for (const secret of ["server-secret", "private-vault", "response-token", "wrong-token"]) {
      expect(`${String(error)} ${JSON.stringify(error)}`).not.toContain(secret);
    }
    expect(error).not.toHaveProperty("details");
    expect(error).not.toHaveProperty("data");
    expect(error).not.toHaveProperty("cause");
  });
  it("classifies a REST-only token rejection during tools/list without reporting invalid protocol", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json(1, { protocolVersion: "2025-03-26", serverInfo: { name: "Notes" } }))
      .mockResolvedValueOnce(new Response(null, { status: 202 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ status: false, code: 315, message: "Scope restricted", details: "Permission denied: /api/mcp" })));
    await expect(testMCPConnection("https://notes.test/api/mcp", "rest-only-token", {}, { fetcher })).rejects.toMatchObject({ kind: "forbidden", code: 315, message: "forbidden" });
  });
  it("requires a failure envelope with a safe numeric code and leaves JSON-RPC results unchanged", async () => {
    for (const payload of [{ code: 308 }, { status: true, code: 308 }, { status: false, code: "308" }, { status: false, code: 308.5 }, { status: false, code: -1 }, { status: false, code: Number.MAX_SAFE_INTEGER + 1 }]) {
      await expect(readMCPResult(new Response(JSON.stringify(payload)), 1)).rejects.toMatchObject({ kind: "invalidResponse" });
    }
    const result = { status: false, code: 308, message: "tool data" };
    expect(await readMCPResult(json(1, result), 1)).toEqual(result);
    expect(await readMCPResult(new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result, status: false, code: 308 })), 1)).toEqual(result);
  });
  it("times out the whole handshake and sanitizes network failures", async () => {
    const fetcher = vi.fn((_url, options) => new Promise<Response>((_resolve, reject) => options.signal.addEventListener("abort", () => reject(new Error("secret")))));
    await expect(testMCPConnection("https://notes.test/api/mcp", "secret", {}, { fetcher, timeoutMs: 5 })).rejects.toMatchObject({ kind: "timeout", message: "timeout" });
    await expect(testMCPConnection("https://notes.test/api/mcp", "secret", {}, { fetcher: vi.fn().mockRejectedValue(new Error("secret")) })).rejects.toMatchObject({ kind: "network", message: "network" });
  });
  it("rejects malformed tools and follows list pagination", async () => {
    const init = () => json(1, { protocolVersion: "2025-03-26", serverInfo: { name: "Notes" } });
    const fetcher = vi.fn().mockResolvedValueOnce(init()).mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(json(2, { tools: [{ name: "one" }], nextCursor: "page2" })).mockResolvedValueOnce(json(2, { tools: [{ name: "two" }] }));
    expect((await testMCPConnection("https://notes.test/api/mcp", "secret", {}, { fetcher })).tools).toEqual(["one", "two"]);
    expect(JSON.parse(fetcher.mock.calls[3][1].body).params).toEqual({ cursor: "page2" });
    const bad = vi.fn().mockResolvedValueOnce(init()).mockResolvedValueOnce(new Response(null, { status: 202 })).mockResolvedValueOnce(json(2, { tools: [{}] }));
    await expect(testMCPConnection("https://notes.test/api/mcp", "secret", {}, { fetcher: bad })).rejects.toMatchObject({ kind: "invalidResponse" });
  });
});
