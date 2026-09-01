import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  CctpVersion,
  MESSAGE_SENT_DISCRIMINATOR,
  PROGRAMS,
  RENT_PAYER_OFFSET,
} from "./constants";

const BUCKETS = 256;
const ATTEMPTS = 5;

export interface Stats {
  generatedAt: string;
  accounts: number;
  lamports: number;
  wallets: number;
  v1: { accounts: number; lamports: number; wallets: number };
  v2: { accounts: number; lamports: number; wallets: number };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function bucket(connection: Connection, version: CctpVersion, prefix: number) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await connection.getProgramAccounts(PROGRAMS[version].program, {
        dataSlice: { offset: RENT_PAYER_OFFSET, length: 32 },
        filters: [
          { memcmp: { offset: 0, bytes: bs58.encode(MESSAGE_SENT_DISCRIMINATOR) } },
          { memcmp: { offset: RENT_PAYER_OFFSET, bytes: bs58.encode(Uint8Array.of(prefix)) } },
        ],
      });
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
}

async function collect(
  connection: Connection,
  version: CctpVersion,
  pauseMs: number,
  log: (line: string) => void
) {
  const payers = new Set<string>();
  let accounts = 0;
  let lamports = 0;

  for (let prefix = 0; prefix < BUCKETS; prefix++) {
    for (const { account } of await bucket(connection, version, prefix)) {
      payers.add(new PublicKey(account.data).toBase58());
      lamports += account.lamports;
      accounts += 1;
    }

    if ((prefix + 1) % 32 === 0) {
      log(`  ${version} ${prefix + 1}/${BUCKETS} buckets, ${accounts} accounts so far`);
    }

    await sleep(pauseMs);
  }

  return { accounts, lamports, payers };
}

export async function countStats(
  connection: Connection,
  pauseMs = 250,
  log: (line: string) => void = console.log
): Promise<Stats> {
  const v1 = await collect(connection, "v1", pauseMs, log);
  const v2 = await collect(connection, "v2", pauseMs, log);

  const stats: Stats = {
    generatedAt: new Date().toISOString(),
    accounts: v1.accounts + v2.accounts,
    lamports: v1.lamports + v2.lamports,
    wallets: new Set([...v1.payers, ...v2.payers]).size,
    v1: { accounts: v1.accounts, lamports: v1.lamports, wallets: v1.payers.size },
    v2: { accounts: v2.accounts, lamports: v2.lamports, wallets: v2.payers.size },
  };

  if (stats.accounts === 0) throw new Error("counted zero accounts, refusing to report");

  return stats;
}
