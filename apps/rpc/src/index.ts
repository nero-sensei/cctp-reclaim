import { isAllowed } from "./methods.ts";
import { forward, parseUpstreams, rotation } from "./upstreams.ts";

export interface Env {
  RPC_URLS: string;
  ALLOWED_ORIGINS: string;
  LIMITER: RateLimit;
}

const rpcError = (status: number, code: number, message: string, headers: HeadersInit = {}) =>
  Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers });

function cors(origin: string): Record<string, string> {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type, solana-client",
    "access-control-max-age": "86400",
    vary: "origin",
  };
}

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get("origin") ?? "";
    if (!env.ALLOWED_ORIGINS.split(",").includes(origin)) {
      return rpcError(403, -32003, "origin not allowed");
    }

    const headers = cors(origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });

    const ip = request.headers.get("cf-connecting-ip") ?? "unknown";
    if (!(await env.LIMITER.limit({ key: ip })).success) {
      return rpcError(429, -32005, "rate limited", headers);
    }

    const upstreams = parseUpstreams(env.RPC_URLS);
    if (upstreams.length === 0) return rpcError(503, -32603, "no upstream configured", headers);

    if (request.headers.get("upgrade") === "websocket") {
      const [upstream] = rotation(upstreams);
      return fetch(upstream!, { headers: request.headers });
    }

    if (request.method !== "POST") return rpcError(405, -32600, "use POST", headers);

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
