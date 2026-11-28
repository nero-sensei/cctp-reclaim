import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import worker, { type Env } from "./index.ts";

const ORIGIN = "https://jigs.fyi";
const UPSTREAMS = ["https://a.example/?api-key=secret-a", "https://b.example/?api-key=secret-b"];

let allow = true;
const env: Env = {
  RPC_URLS: UPSTREAMS.join(","),
  ALLOWED_ORIGINS: `${ORIGIN},http://localhost:4321`,
  LIMITER: { limit: async () => ({ success: allow }) },
};

interface Init {
  method?: string;
  headers?: Record<string, string>;
}

const call = (body: unknown, { method = "POST", headers = {} }: Init = {}) =>
  worker.fetch(
    new Request("https://rpc.jigs.fyi/", {
      method,
      body: body === null ? null : typeof body === "string" ? body : JSON.stringify(body),
      headers: { origin: ORIGIN, "content-type": "application/json", ...headers },
    }),
    env,
  );

const rpc = (method: string) => ({ jsonrpc: "2.0", id: 1, method, params: [] });
const upstream = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>();
const calledUrls = () => upstream.mock.calls.map(([url]) => url);

beforeEach(() => {
  allow = true;
  upstream.mockReset();
  upstream.mockResolvedValue(Response.json({ jsonrpc: "2.0", id: 1, result: 7 }));
  vi.stubGlobal("fetch", upstream);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("guards", () => {
  test("rejects an unknown or missing origin before touching an upstream", async () => {
    for (const origin of ["https://evil.example", ""]) {
      const response = await call(rpc("getBalance"), { headers: { origin } });
      expect(response.status).toBe(403);
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  test("answers preflight with CORS for an allowed origin", async () => {
    const response = await call(null, { method: "OPTIONS" });
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(response.headers.get("access-control-allow-headers")).toContain("solana-client");
  });

  test("rate limits per caller", async () => {
    allow = false;
    expect((await call(rpc("getBalance"))).status).toBe(429);
    expect(upstream).not.toHaveBeenCalled();
  });

  test.each([
    ["a method outside the allowlist", rpc("getBlock")],
    ["a batch", [rpc("getBalance")]],
    ["a call without a method", { jsonrpc: "2.0", id: 1 }],
    ["getProgramAccounts without a memcmp filter", rpc("getProgramAccounts")],
  ])("refuses %s", async (_label, body) => {
    expect((await call(body)).status).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });

  test("refuses malformed JSON", async () => {
    const response = await call("{not json");
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: -32700 } });
  });
});

describe("forwarding", () => {
  test("relays the upstream answer with CORS headers", async () => {
    const response = await call(rpc("getBalance"));
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect(await response.json()).toEqual({ jsonrpc: "2.0", id: 1, result: 7 });
  });

  test("rotates the starting upstream between requests", async () => {
    await call(rpc("getBalance"));
    await call(rpc("getBalance"));
    expect(new Set(calledUrls())).toEqual(new Set(UPSTREAMS));
  });

  test.each([
    ["a 429", () => Promise.resolve(new Response("", { status: 429 }))],
    ["a 503", () => Promise.resolve(new Response("", { status: 503 }))],
    ["a 401 from a bad key", () => Promise.resolve(new Response("", { status: 401 }))],
    ["a network error", () => Promise.reject(new TypeError("fetch failed"))],
  ])("fails over to the next upstream on %s", async (_label, failure) => {
    upstream.mockImplementationOnce(failure);
    const response = await call(rpc("getBalance"));
    expect(response.status).toBe(200);
    expect(new Set(calledUrls())).toEqual(new Set(UPSTREAMS));
  });

  test("passes a client error through without retrying", async () => {
    upstream.mockResolvedValueOnce(new Response("{}", { status: 400 }));
    expect((await call(rpc("getBalance"))).status).toBe(400);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  test("never leaks upstream URLs when every upstream fails", async () => {
    upstream.mockResolvedValue(new Response("", { status: 500 }));
    const response = await call(rpc("getBalance"));
    expect(response.status).toBe(502);
    expect(await response.text()).not.toMatch(/secret|example/);
    expect(upstream).toHaveBeenCalledTimes(UPSTREAMS.length);
  });

  test("proxies websocket upgrades without leaking client headers", async () => {
    await call(null, {
      method: "GET",
      headers: { upgrade: "WebSocket", cookie: "session=1", "cf-connecting-ip": "1.2.3.4" },
    });
    const [url, init] = upstream.mock.calls[0] ?? [];
    const sent = new Headers(init?.headers);
    expect(UPSTREAMS).toContain(url);
    expect(sent.get("upgrade")).toBe("websocket");
    expect([sent.has("origin"), sent.has("cookie"), sent.has("cf-connecting-ip")]).toEqual([
      false,
      false,
      false,
    ]);
  });

  test("allows getProgramAccounts with a memcmp filter", async () => {
    const body = {
      ...rpc("getProgramAccounts"),
      params: ["P", { filters: [{ memcmp: { offset: 0, bytes: "x" } }] }],
    };
    expect((await call(body)).status).toBe(200);
  });
});
