let next = Math.floor(Math.random() * 1_000);

export function parseUpstreams(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((url) => url.trim())
    .filter((url) => url.startsWith("https://"));
}

export function rotation(upstreams: string[]): string[] {
  const start = next++ % upstreams.length;
  return [...upstreams.slice(start), ...upstreams.slice(0, start)];
}

const retryable = (status: number) => status === 429 || status >= 500;

export async function forward(upstreams: string[], body: string): Promise<Response | null> {
  for (const url of rotation(upstreams)) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
      if (!retryable(response.status)) return response;
    } catch {}
  }
  return null;
}
