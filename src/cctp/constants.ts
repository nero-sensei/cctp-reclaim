import { PublicKey } from "@solana/web3.js";

export type CctpVersion = "v1" | "v2";

export const PROGRAMS: Record<
  CctpVersion,
  { program: PublicKey; state: PublicKey; lenOffset: number }
> = {
  v1: {
    program: new PublicKey("CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd"),
    state: new PublicKey("BWrwSWjbikT3H7qHAkUEbLmwDQoB4ZDJ4wcSEhSPTZCu"),
    lenOffset: 40,
  },
  v2: {
    program: new PublicKey("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC"),
    state: new PublicKey("W1k5ijkaSTo5iA5zChNpfzcy796fLhkBxfmJuR8W8HU"),
    lenOffset: 48,
  },
};

export const MESSAGE_SENT_DISCRIMINATOR = Buffer.from([131, 100, 133, 56, 166, 225, 151, 60]);
export const RECLAIM_DISCRIMINATOR = Buffer.from([0x5e, 0xc6, 0xb4, 0x9f, 0x83, 0xec, 0x0f, 0xae]);
export const RENT_PAYER_OFFSET = 8;
export const RECLAIM_WINDOW_SECS = 432_000;
export const IRIS_BASE = "https://iris-api.circle.com";
export const IRIS_MIN_INTERVAL_MS = 120;
export const SOLANA_DOMAIN = 5;
export const MAX_TX_BYTES = 1232;
export const RENT_EXEMPT_MINIMUM = 890_880;
export const SIGNATURE_FEE = 5_000;

export const CU_PER_ACCOUNT = 150_000;
export const CU_MARGIN = 20_000;
export const MIN_PRIORITY_FEE = 50_000;
export const MAX_PRIORITY_FEE = 500_000;
export const MIN_TOP_UP = 10_000_000;
