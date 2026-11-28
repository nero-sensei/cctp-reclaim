import { address } from "@solana/kit";

export type CctpVersion = "v1" | "v2";

export const VERSIONS: readonly CctpVersion[] = ["v1", "v2"];

export const PROGRAMS = {
  v1: {
    program: address("CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd"),
    state: address("BWrwSWjbikT3H7qHAkUEbLmwDQoB4ZDJ4wcSEhSPTZCu"),
    lengthOffset: 40,
  },
  v2: {
    program: address("CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC"),
    state: address("W1k5ijkaSTo5iA5zChNpfzcy796fLhkBxfmJuR8W8HU"),
    lengthOffset: 48,
  },
} as const;

export const MESSAGE_SENT_DISCRIMINATOR = new Uint8Array([131, 100, 133, 56, 166, 225, 151, 60]);
export const RECLAIM_DISCRIMINATOR = new Uint8Array([94, 198, 180, 159, 131, 236, 15, 174]);
export const RENT_PAYER_OFFSET = 8;
export const CREATED_AT_OFFSET = 40;
export const RECLAIM_WINDOW_SECONDS = 432_000;
export const IRIS_URL = "https://iris-api.circle.com";
export const SOLANA_DOMAIN = 5;
// 1.4M compute units per transaction / ~146k measured per v2 reclaim
export const MAX_RECLAIMS_PER_TRANSACTION = 9;
