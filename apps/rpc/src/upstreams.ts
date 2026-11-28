let next = Math.floor(Math.random() * 1_000);

const TIMEOUT_MS = 15_000;

export function parseUpstreams(value: string): string[] {
  return value.split(/[\s,]+/).filter((url) => url.startsWith("https://"));
}

export function rotation(upstreams: string[]): string[] {
  const start = next++ % upstreams.length;
  return [...upstreams.slice(start), ...upstreams.slice(0, start)];
}

const retryable = (status: number) =>
  status === 401 || status === 402 || status === 403 || status === 429 || status >= 500;

export async function forward(upstreams: string[], body: string): Promise<Response | null> {
  for (const url of upstreams) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!retryable(response.status)) return response;
      await response.body?.cancel();
    } catch {}
  }
  return null;
}
