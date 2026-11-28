import { isAllowed } from "./methods.ts";
import { forward, parseUpstreams, rotation } from "./upstreams.ts";
import { proxyWebSocket } from "./websocket.ts";

export interface Env {
  RPC_URLS: string;
  ALLOWED_ORIGINS: string;
  LIMITER: RateLimit;
}

const MAX_BODY_BYTES = 64 * 1024;

const rpcError = (
  status: number,
  code: number,
  message: string,
  headers: Record<string, string> = {},
) =>
  Response.json(
    { jsonrpc: "2.0", id: null, error: { code, message } },
    { status, headers: { ...headers, "cache-control": "no-store" } },
  );

function cors(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, solana-client",
    "access-control-max-age": "7200",
    vary: "origin",
  };
}

function rateLimitKey(ip: string): string {
  return ip.includes(":") ? ip.split(":").slice(0, 4).join(":") : ip;
}

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get("origin") ?? "";
    const allowed = env.ALLOWED_ORIGINS.split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!allowed.includes(origin)) return rpcError(403, -32003, "origin not allowed");

    const headers = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (!(await env.LIMITER.limit({ key: rateLimitKey(ip) })).success) {
      return rpcError(429, -32005, "rate limited", headers);
    }

    const upstreams = rotation(parseUpstreams(env.RPC_URLS));
    const [upstream] = upstreams;
    if (!upstream) return rpcError(503, -32603, "no upstream configured", headers);

    if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
      const response = await proxyWebSocket(upstream, request);
      return response ?? rpcError(502, -32603, "upstream refused websocket", headers);
    }

    if (request.method !== "POST") return rpcError(405, -32600, "use POST", headers);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
      return rpcError(413, -32600, "request too large", headers);
    }

    const body = await request.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return rpcError(400, -32700, "parse error", headers);
    }
    if (!isAllowed(parsed)) return rpcError(400, -32601, "method not allowed", headers);

    const response = await forward(upstreams, body);
    if (!response) return rpcError(502, -32603, "all upstreams failed", headers);

    return new Response(response.body, {
      status: response.status,
      headers: { ...headers, "content-type": "application/json" },
    });
  },
} satisfies ExportedHandler<Env>;
