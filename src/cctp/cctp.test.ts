import assert from "node:assert/strict";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  decodeEventAccount,
  EventAccount,
  isUnlocked,
  requiredBalance,
  topUpNeeded,
  totalLamports,
} from "./accounts";
import { Attestation } from "./attest";
import {
  MAX_TX_BYTES,
  MESSAGE_SENT_DISCRIMINATOR,
  MIN_TOP_UP,
  RECLAIM_DISCRIMINATOR,
  RECLAIM_WINDOW_SECS,
  RENT_EXEMPT_MINIMUM,
  SIGNATURE_FEE,
} from "./constants";
import { buildReclaimInstruction, buildTransaction, Claimable, planBatches } from "./tx";

const payer = new PublicKey("9eicTMCZUADpkyXdPjjdyqhAukyzcpxwqHwsKxS38QMf");

const rawAccount = (version: "v1" | "v2", message: Buffer, createdAt = 0): Buffer => {
  const prefix = version === "v1" ? Buffer.alloc(0) : Buffer.alloc(8);
  if (version === "v2") prefix.writeBigInt64LE(BigInt(createdAt), 0);

  const len = Buffer.alloc(4);
  len.writeUInt32LE(message.length, 0);
  return Buffer.concat([MESSAGE_SENT_DISCRIMINATOR, payer.toBuffer(), prefix, len, message]);
};

const account = (version: "v1" | "v2", createdAt = 0): EventAccount =>
  decodeEventAccount(
    version,
    Keypair.generate().publicKey,
    version === "v1" ? 2_923_200 : 3_869_760,
    rawAccount(version, Buffer.alloc(version === "v1" ? 248 : 376, 7), createdAt)
  );

const attestation = (version: "v1" | "v2"): Attestation => ({
  attestation: Buffer.alloc(130, 1),
  destinationMessage: version === "v2" ? Buffer.alloc(376, 2) : undefined,
});

const claimable = (version: "v1" | "v2", createdAt = 0): Claimable => ({
  account: account(version, createdAt),
  attestation: attestation(version),
});

test("decodes a v1 account", () => {
  const decoded = account("v1");
  assert.equal(decoded.rentPayer.toBase58(), payer.toBase58());
  assert.equal(decoded.message.length, 248);
  assert.equal(decoded.createdAt, null);
  assert.equal(decoded.unlocksAt, null);
});

test("decodes a v2 account and derives the unlock time", () => {
  const decoded = account("v2", 1_700_000_000);
  assert.equal(decoded.message.length, 376);
  assert.equal(decoded.createdAt, 1_700_000_000);
  assert.equal(decoded.unlocksAt, 1_700_000_000 + RECLAIM_WINDOW_SECS);
});

test("rejects a truncated message", () => {
  const data = rawAccount("v1", Buffer.alloc(248, 7)).subarray(0, 100);
  assert.throws(() => decodeEventAccount("v1", payer, 0, data), /truncated/);
});

test("rejects account data too short to hold a length prefix", () => {
  assert.throws(() => decodeEventAccount("v1", payer, 0, Buffer.alloc(12)), /too short/);
  assert.throws(() => decodeEventAccount("v2", payer, 0, Buffer.alloc(44)), /too short/);
});

test("encodes v1 instruction data to exact bytes", () => {
  const item = claimable("v1");
  item.attestation = { attestation: Buffer.from("aabbcc", "hex") };
  const { data } = buildReclaimInstruction(item);

  assert.equal(data.toString("hex"), "5ec6b49f83ec0fae03000000aabbcc");
});

test("encodes v2 instruction data to exact bytes", () => {
  const item = claimable("v2");
  item.attestation = {
    attestation: Buffer.from("aabbcc", "hex"),
    destinationMessage: Buffer.from("ddee", "hex"),
  };
  const { data } = buildReclaimInstruction(item);

  assert.equal(data.toString("hex"), "5ec6b49f83ec0fae03000000aabbcc02000000ddee");
});

test("requires rent exemption plus one fee per batch", () => {
  assert.equal(requiredBalance(1), RENT_EXEMPT_MINIMUM + SIGNATURE_FEE);
  assert.equal(requiredBalance(4), RENT_EXEMPT_MINIMUM + SIGNATURE_FEE * 4);
  assert.equal(requiredBalance(0), RENT_EXEMPT_MINIMUM + SIGNATURE_FEE);
});

test("asks for a round top up only when the balance is short", () => {
  assert.equal(topUpNeeded(RENT_EXEMPT_MINIMUM + SIGNATURE_FEE, 1), 0);
  assert.equal(topUpNeeded(0, 1), MIN_TOP_UP);
  assert.equal(topUpNeeded(RENT_EXEMPT_MINIMUM, 1), MIN_TOP_UP);
});

test("v1 is always unlocked, v2 unlocks exactly on the boundary", () => {
  const v2 = account("v2", 1_000_000);
  assert.equal(isUnlocked(account("v1"), 0), true);
  assert.equal(isUnlocked(v2, v2.unlocksAt! - 1), false);
  assert.equal(isUnlocked(v2, v2.unlocksAt!), true);
});

test("sums lamports", () => {
  assert.equal(totalLamports([account("v1"), account("v2")]), 2_923_200 + 3_869_760);
});

test("builds v1 instruction data as discriminator + length + attestation", () => {
  const item = claimable("v1");
  const { data, keys } = buildReclaimInstruction(item);

  assert.deepEqual(data.subarray(0, 8), RECLAIM_DISCRIMINATOR);
  assert.equal(data.readUInt32LE(8), 130);
  assert.equal(data.length, 8 + 4 + 130);
  assert.deepEqual(
    keys.map((k) => [k.isSigner, k.isWritable]),
    [
      [true, true],
      [false, true],
      [false, true],
    ]
  );
  assert.equal(keys[0].pubkey.toBase58(), payer.toBase58());
  assert.equal(keys[2].pubkey.toBase58(), item.account.address.toBase58());
});

test("appends the destination message for v2", () => {
  const { data } = buildReclaimInstruction(claimable("v2"));
  assert.equal(data.readUInt32LE(8), 130);
  assert.equal(data.readUInt32LE(8 + 4 + 130), 376);
  assert.equal(data.length, 8 + 4 + 130 + 4 + 376);
});

test("refuses a v2 reclaim without a destination message", () => {
  const item = claimable("v2");
  item.attestation = { attestation: Buffer.alloc(130, 1) };
  assert.throws(() => buildReclaimInstruction(item), /destination message/);
});

test("packs multiple v1 reclaims into one transaction", () => {
  const batches = planBatches([claimable("v1"), claimable("v1"), claimable("v1")], payer);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].accounts.length, 3);
});

test("packs v2 reclaims one per transaction", () => {
  const batches = planBatches([claimable("v2"), claimable("v2")], payer);
  assert.equal(batches.length, 2);
  assert.deepEqual(
    batches.map((b) => b.accounts.length),
    [1, 1]
  );
});

test("never exceeds the transaction size limit and loses nothing", () => {
  const items = [
    ...Array.from({ length: 9 }, () => claimable("v1")),
    ...Array.from({ length: 3 }, () => claimable("v2")),
  ];
  const batches = planBatches(items, payer);

  for (const batch of batches) {
    const size = buildTransaction(batch, payer, PublicKey.default.toBase58()).serialize().length;
    assert.ok(size <= MAX_TX_BYTES, `batch of ${batch.accounts.length} is ${size} bytes`);
  }

  assert.equal(
    batches.reduce((sum, b) => sum + b.accounts.length, 0),
    items.length
  );
  assert.equal(
    batches.reduce((sum, b) => sum + b.lamports, 0),
    totalLamports(items.map((i) => i.account))
  );
});

test("orders v1 reclaims ahead of v2", () => {
  const batches = planBatches([claimable("v2"), claimable("v1"), claimable("v1")], payer);
  const versions = batches.flatMap((b) => b.accounts.map((a) => a.version));
  assert.deepEqual(versions, ["v1", "v1", "v2"]);
});
