import {
  type Address,
  type ReadonlyUint8Array,
  getBase64Decoder,
  lamports,
  some,
} from "@solana/kit";
import {
  AccountState,
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token-2022";
import { describe, expect, test } from "vite-plus/test";
import { classify, findReclaims } from "./accounts.ts";
import { MINIMUM, OLD_RENT, addressOf, owner, tokenData } from "./fixtures.ts";

const run = (
  data: ReadonlyUint8Array,
  balance = OLD_RENT,
  program: Address = TOKEN_PROGRAM_ADDRESS,
) => classify({ address: addressOf(9), program, balance, data, minimum: MINIMUM }, owner);

const legacy = (seed: number, amount: bigint) => ({
  pubkey: addressOf(seed),
  account: {
    lamports: OLD_RENT,
    data: [getBase64Decoder().decode(tokenData({ amount })), "base64"],
  },
});

const wrapped = (amount: bigint) => tokenData({ amount, isNative: some(MINIMUM) });
const frozen = (amount: bigint) => tokenData({ amount, state: AccountState.Frozen });

describe("classify", () => {
  test("closes an empty account for its whole balance", () => {
    expect(run(tokenData())).toMatchObject({ action: "close", lamports: OLD_RENT });
  });

  test("withdraws only the excess from an account that still holds tokens", () => {
    expect(run(tokenData({ amount: 5n }))).toMatchObject({
      action: "withdraw",
      lamports: OLD_RENT - MINIMUM,
    });
  });

  test("ignores excess smaller than a signature fee", () => {
    expect(run(tokenData({ amount: 5n }), MINIMUM)).toBeNull();
    expect(run(tokenData({ amount: 5n }), lamports(MINIMUM + 4_999n))).toBeNull();
  });

  test("never closes a frozen account but still withdraws its excess", () => {
    expect(run(frozen(0n))).toMatchObject({ action: "withdraw" });
    expect(run(frozen(5n))).toMatchObject({ action: "withdraw" });
    expect(run(frozen(0n), MINIMUM)).toMatchObject({ reason: "frozen" });
  });

  test("skips an account owned by another wallet", () => {
    expect(run(tokenData({ owner: addressOf(7) }))).toMatchObject({
      reason: "owned by another wallet",
    });
  });

  test("skips data it cannot decode instead of failing the scan", () => {
    const data = Uint8Array.from(tokenData());
    data[108] = 9;
    expect(run(data)).toEqual({ address: addressOf(9), mint: null, reason: "unreadable" });
  });

  test("falls back to withdraw when someone else holds the close authority", () => {
    expect(run(tokenData({ closeAuthority: some(addressOf(7)) }))).toMatchObject({
      action: "withdraw",
    });
    expect(run(tokenData({ closeAuthority: some(owner) }))).toMatchObject({ action: "close" });
  });

  test("never unwraps wrapped SOL, but closes an empty wrapped SOL account", () => {
    expect(run(wrapped(1_000_000n), lamports(MINIMUM + 1_000_000n))).toMatchObject({
      reason: "holds wrapped SOL",
    });
    expect(run(wrapped(0n), MINIMUM)).toMatchObject({ action: "close", lamports: MINIMUM });
  });

  test.each([
    ["withheld transfer fees", { __kind: "TransferFeeAmount", withheldAmount: 3n }],
    [
      "a confidential transfer account",
      {
        __kind: "ConfidentialTransferAccount",
        approved: true,
        elgamalPubkey: addressOf(3),
        pendingBalanceLow: new Uint8Array(64),
        pendingBalanceHigh: new Uint8Array(64),
        availableBalance: new Uint8Array(64),
        decryptableAvailableBalance: new Uint8Array(36),
        allowConfidentialCredits: true,
        allowNonConfidentialCredits: true,
        pendingBalanceCreditCounter: 0n,
        maximumPendingBalanceCreditCounter: 0n,
        expectedPendingBalanceCreditCounter: 0n,
        actualPendingBalanceCreditCounter: 0n,
      },
    ],
  ] as const)("does not close a Token-2022 account with %s", (_label, extension) => {
    const data = tokenData({}, [extension]);
    expect(run(data, OLD_RENT, TOKEN_2022_PROGRAM_ADDRESS)).toMatchObject({ action: "withdraw" });
  });

  test("closes a Token-2022 account whose fees were already harvested", () => {
    const data = tokenData({}, [{ __kind: "TransferFeeAmount", withheldAmount: 0n }]);
    expect(run(data, OLD_RENT, TOKEN_2022_PROGRAM_ADDRESS)).toMatchObject({
      action: "close",
      program: TOKEN_2022_PROGRAM_ADDRESS,
    });
  });
});

test("findReclaims reads both programs and prices rent by each account's size", async () => {
  const programs: string[] = [];
  const sizes: bigint[] = [];
  const extended = {
    pubkey: addressOf(20),
    account: {
      lamports: OLD_RENT,
      data: [
        getBase64Decoder().decode(tokenData({ amount: 1n }, [{ __kind: "ImmutableOwner" }])),
        "base64",
      ],
    },
  };
  const rpc = {
    getTokenAccountsByOwner: (_owner: string, { programId }: { programId: string }) => ({
      send: async () => {
        programs.push(programId);
        return {
          value:
            programId === TOKEN_PROGRAM_ADDRESS
              ? [legacy(10, 0n), legacy(11, 4n), legacy(12, 0n)]
              : [extended],
        };
      },
    }),
    getMinimumBalanceForRentExemption: (size: bigint) => ({
      send: async () => {
        sizes.push(size);
        return lamports((128n + size) * 5_080n);
      },
    }),
  };

  const { reclaims, skipped } = await findReclaims(rpc as never, owner);

  expect(programs.toSorted()).toEqual(
    [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS].toSorted(),
  );
  expect(sizes.toSorted((a, b) => Number(a - b))).toEqual([165n, 170n]);
  expect(reclaims.map(({ action, lamports: amount }) => [action, amount])).toEqual([
    ["close", OLD_RENT],
    ["withdraw", OLD_RENT - (128n + 165n) * 5_080n],
    ["close", OLD_RENT],
    ["withdraw", OLD_RENT - (128n + 170n) * 5_080n],
  ]);
  expect(skipped).toEqual([]);
});
