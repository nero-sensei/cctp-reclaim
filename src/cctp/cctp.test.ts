import assert from "node:assert/strict";
import { test } from "node:test";
import { type Blockhash, PublicKey } from "@solana/web3.js";
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
  CU_MARGIN,
  CU_PER_ACCOUNT,
  MAX_CU_PER_TX,
  MAX_TX_BYTES,
  MAX_V1_TX_BYTES,
  MESSAGE_SENT_DISCRIMINATOR,
  MIN_TOP_UP,
  RECLAIM_DISCRIMINATOR,
  RECLAIM_WINDOW_SECS,
  SIGNATURE_FEE,
} from "./constants";
import { buildReclaimInstruction, buildTransaction, Claimable, planBatches } from "./tx";

const payer = new PublicKey("9eicTMCZUADpkyXdPjjdyqhAukyzcpxwqHwsKxS38QMf");
const RENT = 650_240;
const BLOCKHASH = PublicKey.default.toBase58() as string as Blockhash;

let seed = 0;
const address = (): PublicKey => {
  seed += 1;
  const bytes = new Uint8Array(32);
  bytes[0] = seed & 0xff;
  bytes[1] = seed >> 8;
  bytes[31] = 1;
  return new PublicKey(bytes);
};

const dataOf = (item: Claimable): Buffer => Buffer.from(buildReclaimInstruction(item).data);

const rawAccount = (version: "v1" | "v2", message: Buffer, createdAt = 0): Buffer => {
  const prefix = version === "v1" ? Buffer.alloc(0) : Buffer.alloc(8);
  if (version === "v2") prefix.writeBigInt64LE(BigInt(createdAt), 0);

  const len = Buffer.alloc(4);
  len.writeUInt32LE(message.length, 0);
  return Buffer.concat([MESSAGE_SENT_DISCRIMINATOR, Buffer.from(payer.toBytes()), prefix, len, message]);
};

const account = (version: "v1" | "v2", createdAt = 0): EventAccount =>
  decodeEventAccount(
    version,
    address(),
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

  assert.equal(dataOf(item).toString("hex"), "5ec6b49f83ec0fae03000000aabbcc");
});

test("encodes v2 instruction data to exact bytes", () => {
  const item = claimable("v2");
  item.attestation = {
    attestation: Buffer.from("aabbcc", "hex"),
    destinationMessage: Buffer.from("ddee", "hex"),
  };

  assert.equal(dataOf(item).toString("hex"), "5ec6b49f83ec0fae03000000aabbcc02000000ddee");
});

test("requires rent exemption plus one fee per batch", () => {
  assert.ok(requiredBalance([1], RENT) > RENT + SIGNATURE_FEE);
  assert.ok(requiredBalance([1, 1, 1, 1], RENT) > requiredBalance([1], RENT));
  assert.equal(requiredBalance([], RENT), RENT + SIGNATURE_FEE);
});

test("uses the live rent exempt minimum, not the pre-cut one", () => {
  const balance = requiredBalance([1], RENT);
  assert.equal(topUpNeeded(balance, [1], RENT), 0);
  assert.equal(topUpNeeded(balance, [1], 890_880), MIN_TOP_UP);
});

test("asks for a round top up only when the balance is short", () => {
  assert.equal(topUpNeeded(requiredBalance([1], RENT), [1], RENT), 0);
  assert.equal(topUpNeeded(0, [1], RENT), MIN_TOP_UP);
  assert.equal(topUpNeeded(RENT, [1], RENT), MIN_TOP_UP);
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
  const { keys } = buildReclaimInstruction(item);
  const data = dataOf(item);

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
  const data = dataOf(claimable("v2"));
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

test("skips an oversized reclaim instead of dropping the whole batch", () => {
  const huge = claimable("v2");
  huge.attestation = {
    attestation: Buffer.alloc(130, 1),
    destinationMessage: Buffer.alloc(1400, 2),
  };

  const batches = planBatches([claimable("v1"), huge, claimable("v1")], payer);
  const planned = batches.reduce((sum, b) => sum + b.accounts.length, 0);

  assert.equal(planned, 2);
  assert.ok(batches.every((b) => b.accounts.every((a) => a.version === "v1")));
});

test("never exceeds the transaction size limit and loses nothing", () => {
  const items = [
    ...Array.from({ length: 9 }, () => claimable("v1")),
    ...Array.from({ length: 3 }, () => claimable("v2")),
  ];
  const batches = planBatches(items, payer);

  for (const batch of batches) {
    const size = buildTransaction(batch, payer, BLOCKHASH).serialize().length;
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

test("v1 transactions pack more reclaims and stay inside size and compute limits", () => {
  const items = [
    ...Array.from({ length: 20 }, () => claimable("v1")),
    ...Array.from({ length: 12 }, () => claimable("v2")),
  ];
  const legacy = planBatches(items, payer);
  const batches = planBatches(items, payer, 1);

  assert.ok(batches.length < legacy.length / 2, `${batches.length} vs ${legacy.length}`);
  assert.ok(batches.some((b) => b.accounts.filter((a) => a.version === "v2").length > 1));

  for (const batch of batches) {
    const transaction = buildTransaction(batch, payer, BLOCKHASH);
    const size = transaction.serialize().length;
    assert.equal(transaction.version, 1);
    assert.ok(size <= MAX_V1_TX_BYTES, `batch of ${batch.accounts.length} is ${size} bytes`);
    assert.ok(batch.accounts.length * CU_PER_ACCOUNT + CU_MARGIN <= MAX_CU_PER_TX);
  }

  assert.equal(
    batches.reduce((sum, b) => sum + b.accounts.length, 0),
    items.length
  );
});

test("v1 transactions carry budget in the message, not compute budget instructions", () => {
  const [batch] = planBatches([claimable("v1"), claimable("v1")], payer, 1);
  const { message } = buildTransaction(batch, payer, BLOCKHASH, 100_000);

  assert.equal(message.compiledInstructions.length, 2);
  assert.ok("transactionConfig" in message);
  assert.deepEqual(message.transactionConfig, {
    computeUnitLimit: 2 * CU_PER_ACCOUNT + CU_MARGIN,
    loadedAccountsDataSizeLimit: 64 * 1024 * 1024,
    priorityFeeLamports: BigInt(Math.ceil(((2 * CU_PER_ACCOUNT + CU_MARGIN) * 100_000) / 1_000_000)),
  });
});

test("never mixes v1 and v2 reclaims in one transaction", () => {
  const items = [
    ...Array.from({ length: 11 }, () => claimable("v1")),
    ...Array.from({ length: 10 }, () => claimable("v2")),
  ];

  for (const version of [0, 1] as const) {
    for (const batch of planBatches(items, payer, version)) {
      assert.equal(new Set(batch.accounts.map((a) => a.version)).size, 1);
    }
  }
});

test("orders v1 reclaims ahead of v2", () => {
  const batches = planBatches([claimable("v2"), claimable("v1"), claimable("v1")], payer);
  const versions = batches.flatMap((b) => b.accounts.map((a) => a.version));
  assert.deepEqual(versions, ["v1", "v1", "v2"]);
});
