import { Connection } from "@solana/web3.js";
import { keccak_256 as keccak256 } from "@noble/hashes/sha3.js";
import { EventAccount } from "./accounts";
import { IRIS_BASE, IRIS_MIN_INTERVAL_MS, SOLANA_DOMAIN } from "./constants";

export interface Attestation {
  attestation: Buffer;
  destinationMessage?: Buffer;
}

const hex = (value: string, label: string): Buffer => {
  const raw = value.startsWith("0x") ? value.slice(2) : value;

  if (raw.length === 0 || raw.length % 2 !== 0 || !/^[0-9a-fA-F]+$/.test(raw)) {
    throw new Error(`Circle returned an unreadable ${label}`);
  }

  return Buffer.from(raw, "hex");
};

let lastCall = 0;

async function throttle(): Promise<void> {
  const wait = Math.max(0, lastCall + IRIS_MIN_INTERVAL_MS - Date.now());
  lastCall = Date.now() + wait;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export async function fetchAttestation(
  connection: Connection,
  account: EventAccount
): Promise<Attestation | null> {
  await throttle();
  return account.version === "v1" ? fetchV1(account) : fetchV2(connection, account);
}

async function fetchV1(account: EventAccount): Promise<Attestation | null> {
  const messageHash = "0x" + Buffer.from(keccak256(account.message)).toString("hex");
  const response = await fetch(`${IRIS_BASE}/v1/attestations/${messageHash}`);
  if (!response.ok) return null;

  const body = (await response.json()) as { attestation?: string | null; status?: string };
  if (body.status !== "complete" || !body.attestation) return null;

  return { attestation: hex(body.attestation, "attestation") };
}

async function fetchV2(connection: Connection, account: EventAccount): Promise<Attestation | null> {
  const signatures = await connection.getSignaturesForAddress(account.address, { limit: 1000 });
  const creating = signatures.at(-1)?.signature;
  if (!creating) return null;

  const response = await fetch(
    `${IRIS_BASE}/v2/messages/${SOLANA_DOMAIN}?transactionHash=${creating}`
  );
  if (!response.ok) return null;

  const body = (await response.json()) as {
    messages?: { attestation?: string; message?: string; status?: string }[];
  };

  const message = body.messages?.[0];
  if (message?.status !== "complete" || !message.attestation || !message.message) return null;

  return {
    attestation: hex(message.attestation, "attestation"),
    destinationMessage: hex(message.message, "message"),
  };
}
