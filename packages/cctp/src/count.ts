import {
  type GetProgramAccountsApi,
  type Rpc,
  getAddressDecoder,
  getBase64Encoder,
} from "@solana/kit";
import { base58Bytes, discriminatorFilter } from "./accounts.ts";
import { type CctpVersion, PROGRAMS, RENT_PAYER_OFFSET } from "./constants.ts";

const BUCKETS = 256;
const ATTEMPTS = 5;

export interface Totals {
  accounts: number;
  lamports: bigint;
  wallets: number;
}

interface Options {
  pauseMs?: number;
  log?: (line: string) => void;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function bucket(rpc: Rpc<GetProgramAccountsApi>, version: CctpVersion, prefix: number) {
  const request = rpc.getProgramAccounts(PROGRAMS[version].program, {
    encoding: "base64",
    dataSlice: { offset: RENT_PAYER_OFFSET, length: 32 },
    filters: [
      discriminatorFilter,
      {
        memcmp: {
          offset: BigInt(RENT_PAYER_OFFSET),
          bytes: base58Bytes(Uint8Array.of(prefix)),
          encoding: "base58",
        },
      },
    ],
  });

  for (let attempt = 1; ; attempt++) {
    try {
      return await request.send();
    } catch (error) {
      if (attempt === ATTEMPTS) throw error;
      await sleep(500 * 2 ** (attempt - 1));
    }
  }
}

async function countVersion(
  rpc: Rpc<GetProgramAccountsApi>,
  version: CctpVersion,
  { pauseMs = 250, log = () => {} }: Options,
) {
  const payers = new Set<string>();
  let accounts = 0;
  let lamports = 0n;

  for (let prefix = 0; prefix < BUCKETS; prefix++) {
    for (const { account } of await bucket(rpc, version, prefix)) {
      payers.add(getAddressDecoder().decode(getBase64Encoder().encode(account.data[0])));
      accounts += 1;
      lamports += account.lamports;
    }
    if ((prefix + 1) % 32 === 0)
      log(`${version} ${prefix + 1}/${BUCKETS} buckets, ${accounts} accounts`);
    await sleep(pauseMs);
  }

  return { accounts, lamports, payers };
}

export async function countOpenAccounts(
  rpc: Rpc<GetProgramAccountsApi>,
  options: Options = {},
): Promise<Record<CctpVersion | "total", Totals>> {
  const v1 = await countVersion(rpc, "v1", options);
  const v2 = await countVersion(rpc, "v2", options);

  const accounts = v1.accounts + v2.accounts;
  if (accounts === 0) throw new Error("counted zero accounts, refusing to report");

  return {
    v1: { accounts: v1.accounts, lamports: v1.lamports, wallets: v1.payers.size },
    v2: { accounts: v2.accounts, lamports: v2.lamports, wallets: v2.payers.size },
    total: {
      accounts,
      lamports: v1.lamports + v2.lamports,
      wallets: new Set([...v1.payers, ...v2.payers]).size,
    },
  };
}
