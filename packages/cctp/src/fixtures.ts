import {
  type ReadonlyUint8Array,
  address,
  getAddressDecoder,
  getAddressEncoder,
  getI64Encoder,
  getU32Encoder,
  lamports,
} from "@solana/kit";
import { type EventAccount, decodeEventAccount } from "./accounts.ts";
import type { Attestation } from "./attest.ts";
import { type CctpVersion, MESSAGE_SENT_DISCRIMINATOR } from "./constants.ts";

export const payer = address("9eicTMCZUADpkyXdPjjdyqhAukyzcpxwqHwsKxS38QMf");

const concat = (...parts: ReadonlyUint8Array[]) =>
  Uint8Array.from(parts.flatMap((part) => [...part]));

export const addressOf = (seed: number) =>
  getAddressDecoder().decode(new Uint8Array(32).fill(seed));

export function rawAccount(version: CctpVersion, message: Uint8Array, createdAt = 0n): Uint8Array {
  return concat(
    MESSAGE_SENT_DISCRIMINATOR,
    getAddressEncoder().encode(payer),
    ...(version === "v2" ? [getI64Encoder().encode(createdAt)] : []),
    getU32Encoder().encode(message.length),
    message,
  );
}

export function eventAccount(version: CctpVersion, seed = 1, createdAt = 0n): EventAccount {
  const size = version === "v1" ? 248 : 376;
  return decodeEventAccount(
    version,
    addressOf(seed),
    lamports(version === "v1" ? 2_923_200n : 3_869_760n),
    rawAccount(version, new Uint8Array(size).fill(7), createdAt),
  );
}

export function attestationFor(version: CctpVersion): Attestation {
  return {
    attestation: new Uint8Array(130).fill(1),
    destinationMessage: version === "v2" ? new Uint8Array(376).fill(2) : null,
  };
}
