import {
  AccountRole,
  createClient,
  createNoopSigner,
  flattenTransactionPlan,
  getTransactionMessageSize,
  getTransactionMessageSizeLimit,
  lamports,
} from "@solana/kit";
import { rpcTransactionPlanner } from "@solana/kit-plugin-rpc";
import { TOKEN_2022_PROGRAM_ADDRESS, TOKEN_PROGRAM_ADDRESS } from "@solana-program/token-2022";
import { describe, expect, test } from "vite-plus/test";
import type { Reclaim } from "./accounts.ts";
import { addressOf, owner } from "./fixtures.ts";
import { MAX_RECLAIMS_PER_TRANSACTION, getReclaimInstruction } from "./instruction.ts";

const signer = createNoopSigner(owner);
const reclaim = (
  seed: number,
  action: Reclaim["action"],
  program: Reclaim["program"] = TOKEN_PROGRAM_ADDRESS,
): Reclaim => ({
  address: addressOf(seed),
  program,
  mint: addressOf(2),
  action,
  lamports: lamports(1n),
});

describe("getReclaimInstruction", () => {
  test.each([
    ["close", 9],
    ["withdraw", 38],
  ] as const)(
    "%s sends the account's rent to the owner, signed by the owner",
    (action, discriminator) => {
      const instruction = getReclaimInstruction(reclaim(5, action), signer);
      expect(instruction.data?.[0]).toBe(discriminator);
      expect(instruction.accounts?.map(({ address, role }) => [address, role])).toEqual([
        [addressOf(5), AccountRole.WRITABLE],
        [owner, AccountRole.WRITABLE],
        [owner, AccountRole.READONLY_SIGNER],
      ]);
    },
  );

  test("targets the program that owns the account", () => {
    expect(getReclaimInstruction(reclaim(5, "close"), signer).programAddress).toBe(
      TOKEN_PROGRAM_ADDRESS,
    );
    expect(
      getReclaimInstruction(reclaim(5, "close", TOKEN_2022_PROGRAM_ADDRESS), signer).programAddress,
    ).toBe(TOKEN_2022_PROGRAM_ADDRESS);
  });
});

describe("transaction packing", () => {
  const reclaims = Array.from({ length: 150 }, (_, i) =>
    getReclaimInstruction(
      reclaim(
        i + 10,
        i % 3 === 0 ? "withdraw" : "close",
        i % 2 ? TOKEN_PROGRAM_ADDRESS : TOKEN_2022_PROGRAM_ADDRESS,
      ),
      signer,
    ),
  );

  const plan = async (version: 0 | 1) => {
    const client = createClient({ payer: signer }).use(
      rpcTransactionPlanner({
        version,
        maxInstructionsPerTransaction: MAX_RECLAIMS_PER_TRANSACTION,
      }),
    );
    return flattenTransactionPlan(await client.planTransactions(reclaims)).map(
      (single) => single.message,
    );
  };

  test.each([0, 1] as const)(
    "v%i keeps every reclaim and stays inside size and account limits",
    async (version) => {
      const messages = await plan(version);
      const kept = messages.flatMap((message) =>
        message.instructions.filter(
          (instruction) =>
            instruction.programAddress !== "ComputeBudget111111111111111111111111111111",
        ),
      );
      expect(kept).toHaveLength(reclaims.length);
      for (const message of messages) {
        const addresses = new Set([
          message.feePayer.address,
          ...message.instructions.flatMap((ix) => [
            ix.programAddress,
            ...(ix.accounts ?? []).map((meta) => meta.address),
          ]),
        ]);
        expect(getTransactionMessageSize(message)).toBeLessThanOrEqual(
          getTransactionMessageSizeLimit(message),
        );
        expect(addresses.size).toBeLessThanOrEqual(64);
      }
    },
  );

  test("v1 fits 150 reclaims in 3 signatures", async () => {
    expect(await plan(1)).toHaveLength(3);
  });
});
