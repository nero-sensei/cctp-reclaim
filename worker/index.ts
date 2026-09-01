interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  STATS: KVNamespace;
  STATS_TOKEN: string;
}

const KEY = "stats";
const CACHE = "public, max-age=300, stale-while-revalidate=86400";

const positive = (value: unknown): boolean =>
  typeof value === "number" && Number.isFinite(value) && value > 0;

function valid(stats: Record<string, never>): boolean {
  if (!stats || typeof stats !== "object") return false;

  const version = (v: Record<string, never>) =>
    v && positive(v.accounts) && positive(v.lamports) && positive(v.wallets);

  return (
    positive(stats.accounts) &&
    positive(stats.lamports) &&
    positive(stats.wallets) &&
    version(stats.v1) &&
    version(stats.v2) &&
    typeof stats.generatedAt === "string" &&
    !Number.isNaN(Date.parse(stats.generatedAt))
  );
}

async function publish(request: Request, env: Env): Promise<Response> {
  if (!env.STATS_TOKEN) return new Response("not configured\n", { status: 503 });

  if (request.headers.get("authorization") !== `Bearer ${env.STATS_TOKEN}`) {
    return new Response("unauthorized\n", { status: 401 });
  }

  let stats;
  try {
    stats = await request.json();
  } catch {
    return new Response("invalid json\n", { status: 400 });
  }

  if (!valid(stats as Record<string, never>)) {
    return new Response("rejected: stats failed validation\n", { status: 422 });
  }

  await env.STATS.put(KEY, JSON.stringify(stats));

  return Response.json({ ok: true, stored: (stats as { generatedAt: string }).generatedAt });
}

async function read(request: Request, env: Env): Promise<Response> {
  const stored = await env.STATS.get(KEY);

  if (stored === null) return env.ASSETS.fetch(request);

  return new Response(stored, {
    headers: { "content-type": "application/json", "cache-control": CACHE },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === "/api/stats") {
      if (request.method !== "POST") return new Response("method not allowed\n", { status: 405 });
      return publish(request, env);
    }

    if (pathname === "/stats.json") return read(request, env);

    return env.ASSETS.fetch(request);
  },
};
