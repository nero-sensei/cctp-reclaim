import { getBase64Decoder, lamports } from "@solana/kit";
import { describe, expect, test } from "vite-plus/test";
import { decodeEventAccount, findEventAccounts, isUnlocked } from "./accounts.ts";
import { PROGRAMS, RECLAIM_WINDOW_SECONDS } from "./constants.ts";
import { addressOf, eventAccount, payer, rawAccount } from "./fixtures.ts";

describe("decodeEventAccount", () => {
  test("reads the rent payer and message of a v1 account", () => {
    const account = eventAccount("v1");
    expect(account.rentPayer).toBe(payer);
    expect(account.message).toHaveLength(248);
    expect(account.unlocksAt).toBeNull();
  });

  test("derives the v2 unlock time from created_at", () => {
    const account = eventAccount("v2", 1, 1_700_000_000n);
    expect(account.rentPayer).toBe(payer);
    expect(account.message).toHaveLength(376);
    expect(account.unlocksAt).toBe(1_700_000_000 + RECLAIM_WINDOW_SECONDS);
  });

  test("rejects a message cut short", () => {
    const data = rawAccount("v1", new Uint8Array(248)).subarray(0, 100);
    expect(() => decodeEventAccount("v1", addressOf(1), lamports(0n), data)).toThrow(/truncated/);
  });

  test("rejects data too short to hold the length prefix", () => {
    expect(() => decodeEventAccount("v1", addressOf(1), lamports(0n), new Uint8Array(43))).toThrow(
      /too short/,
    );
    expect(() => decodeEventAccount("v2", addressOf(1), lamports(0n), new Uint8Array(51))).toThrow(
      /too short/,
    );
  });
});

test("v1 is always unlocked, v2 unlocks exactly at the boundary", () => {
  const v2 = eventAccount("v2", 1, 1_000_000n);
  expect(isUnlocked(eventAccount("v1"), 0)).toBe(true);
  expect(isUnlocked(v2, v2.unlocksAt! - 1)).toBe(false);
  expect(isUnlocked(v2, v2.unlocksAt!)).toBe(true);
});

test("findEventAccounts asks both programs for this wallet's accounts only", async () => {
  const calls: { program: string; filters: unknown }[] = [];
  const rpc = {
    getProgramAccounts: (program: string, config: { filters: unknown }) => ({
      send: async () => {
        calls.push({ program, filters: config.filters });
        const version = program === PROGRAMS.v1.program ? "v1" : "v2";
        const data = rawAccount(version, new Uint8Array(4).fill(9), 5n);
        return [
          {
            pubkey: addressOf(version === "v1" ? 1 : 2),
            account: { lamports: 10n, data: [getBase64Decoder().decode(data), "base64"] },
          },
        ];
      },
    }),
  };

  const accounts = await findEventAccounts(rpc as never, payer);

  expect(calls.map((call) => call.program).toSorted()).toEqual(
    [PROGRAMS.v1.program, PROGRAMS.v2.program].toSorted(),
  );
  for (const { filters } of calls) {
    expect(filters).toContainEqual({ memcmp: { offset: 8n, bytes: payer, encoding: "base58" } });
  }
  expect(
    accounts.map((account) => [account.version, account.message.length, account.lamports]),
  ).toEqual([
    ["v1", 4, 10n],
    ["v2", 4, 10n],
  ]);
});
