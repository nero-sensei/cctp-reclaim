import { Connection } from "@solana/web3.js";
import { MAX_PRIORITY_FEE, MIN_PRIORITY_FEE, PROGRAMS } from "./constants";

const clamp = (value: number): number =>
  Math.max(MIN_PRIORITY_FEE, Math.min(MAX_PRIORITY_FEE, Math.round(value)));

async function heliusEstimate(endpoint: string): Promise<number | null> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: "1",
      method: "getPriorityFeeEstimate",
      params: [
        {
          accountKeys: [PROGRAMS.v1.program.toBase58(), PROGRAMS.v2.program.toBase58()],
          options: { recommended: true },
        },
      ],
    }),
  });

  if (!response.ok) return null;

  const body = (await response.json()) as {
    result?: { priorityFeeEstimate?: number };
  };

  const estimate = body.result?.priorityFeeEstimate;
  return typeof estimate === "number" && Number.isFinite(estimate) ? estimate : null;
}

async function medianRecent(connection: Connection): Promise<number> {
  const recent = await connection.getRecentPrioritizationFees({
    lockedWritableAccounts: [PROGRAMS.v1.program, PROGRAMS.v2.program],
  });

  const fees = recent.map((entry) => entry.prioritizationFee).sort((a, b) => a - b);
  if (fees.length === 0) return MIN_PRIORITY_FEE;

  return fees[Math.floor(fees.length / 2)];
}

export async function priorityFee(connection: Connection, endpoint: string): Promise<number> {
  const resolve = async (): Promise<[number, string]> => {
    if (endpoint.includes("helius")) {
      const estimate = await heliusEstimate(endpoint);
      if (estimate !== null) return [clamp(estimate), "helius"];
    }

    return [clamp(await medianRecent(connection)), "recent-median"];
  };

  try {
    const [fee, source] = await resolve();
    console.info(`priority fee ${fee} microLamports/CU via ${source}`);
    return fee;
  } catch (error) {
    console.info(`priority fee ${MIN_PRIORITY_FEE} microLamports/CU via floor`, error);
    return MIN_PRIORITY_FEE;
  }
}
