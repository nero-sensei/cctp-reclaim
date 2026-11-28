import { keccak_256 } from "@noble/hashes/sha3.js";
import {
  type GetSignaturesForAddressApi,
  type ReadonlyUint8Array,
  type Rpc,
  getBase16Decoder,
  getBase16Encoder,
} from "@solana/kit";
import type { EventAccount } from "./accounts.ts";
import { IRIS_URL, SOLANA_DOMAIN } from "./constants.ts";

export interface Attestation {
  attestation: ReadonlyUint8Array;
  destinationMessage: ReadonlyUint8Array | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function hex(value: unknown, label: string): ReadonlyUint8Array {
  const raw = typeof value === "string" && value.startsWith("0x") ? value.slice(2) : value;
  if (
    typeof raw !== "string" ||
    raw.length === 0 ||
    raw.length % 2 !== 0 ||
    !/^[0-9a-f]+$/i.test(raw)
  ) {
    throw new Error(`Circle returned an unreadable ${label}`);
  }
  return getBase16Encoder().encode(raw.toLowerCase());
}

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  return response.ok ? response.json() : null;
}

export async function fetchAttestation(
  rpc: Rpc<GetSignaturesForAddressApi>,
  account: EventAccount,
): Promise<Attestation | null> {
  return account.version === "v1" ? fetchV1(account) : fetchV2(rpc, account);
}

async function fetchV1(account: EventAccount): Promise<Attestation | null> {
  const hash = getBase16Decoder().decode(keccak_256(account.message));
  const body = await getJson(`${IRIS_URL}/v1/attestations/0x${hash}`);
  if (!isRecord(body) || body.status !== "complete") return null;

  return { attestation: hex(body.attestation, "attestation"), destinationMessage: null };
}

async function fetchV2(
  rpc: Rpc<GetSignaturesForAddressApi>,
  account: EventAccount,
): Promise<Attestation | null> {
  const signatures = await rpc.getSignaturesForAddress(account.address, { limit: 1000 }).send();
  const creation = signatures.at(-1)?.signature;
  if (!creation) return null;

  const body = await getJson(
    `${IRIS_URL}/v2/messages/${SOLANA_DOMAIN}?transactionHash=${creation}`,
  );
  const message: unknown = isRecord(body) && Array.isArray(body.messages) ? body.messages[0] : null;
  if (!isRecord(message) || message.status !== "complete") return null;

  return {
    attestation: hex(message.attestation, "attestation"),
    destinationMessage: hex(message.message, "message"),
  };
}
