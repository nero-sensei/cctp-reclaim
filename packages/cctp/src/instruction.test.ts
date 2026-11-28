import {
  AccountRole,
  type ReadonlyUint8Array,
  createClient,
  createNoopSigner,
  flattenTransactionPlan,
  getBase16Decoder,
  getTransactionMessageSize,
  getTransactionMessageSizeLimit,
} from "@solana/kit";
import { rpcTransactionPlanner } from "@solana/kit-plugin-rpc";
import { describe, expect, test } from "vite-plus/test";
import { PROGRAMS } from "./constants.ts";
import { addressOf, attestationFor, eventAccount, payer } from "./fixtures.ts";
import { getReclaimInstruction } from "./instruction.ts";

const signer = createNoopSigner(payer);
const hex = (bytes: ReadonlyUint8Array) => getBase16Decoder().decode(bytes);

describe("getReclaimInstruction", () => {
  test("encodes v1 data as discriminator, u32 length, attestation", () => {
    const { data } = getReclaimInstruction(
      eventAccount("v1"),
      { attestation: Uint8Array.of(0xaa, 0xbb, 0xcc), destinationMessage: null },
      signer,
    );
    expect(hex(data!)).toBe("5ec6b49f83ec0fae03000000aabbcc");
  });

  test("appends the length-prefixed destination message for v2", () => {
    const { data } = getReclaimInstruction(
      eventAccount("v2"),
      {
        attestation: Uint8Array.of(0xaa, 0xbb, 0xcc),
        destinationMessage: Uint8Array.of(0xdd, 0xee),
      },
      signer,
    );
    expect(hex(data!)).toBe("5ec6b49f83ec0fae03000000aabbcc02000000ddee");
  });

  test("ignores a stray destination message on v1", () => {
    const { data } = getReclaimInstruction(
      eventAccount("v1"),
      { attestation: Uint8Array.of(0xaa), destinationMessage: Uint8Array.of(0xdd) },
      signer,
    );
    expect(hex(data!)).toBe("5ec6b49f83ec0fae01000000aa");
  });

  test("passes rent payer as signer, then state, then the event account", () => {
    const account = eventAccount("v2", 3);
    const instruction = getReclaimInstruction(account, attestationFor("v2"), signer);
    expect(instruction.programAddress).toBe(PROGRAMS.v2.program);
    expect(instruction.accounts).toEqual([
      { address: payer, role: AccountRole.WRITABLE_SIGNER, signer },
      { address: PROGRAMS.v2.state, role: AccountRole.WRITABLE },
      { address: account.address, role: AccountRole.WRITABLE },
    ]);
  });

  test("refuses a signer that did not pay the rent", () => {
    expect(() =>
      getReclaimInstruction(
        eventAccount("v1"),
        attestationFor("v1"),
        createNoopSigner(addressOf(9)),
      ),
    ).toThrow(/rent payer/);
  });

  test("refuses a v2 reclaim without a destination message", () => {
    expect(() =>
      getReclaimInstruction(
        eventAccount("v2"),
        { attestation: new Uint8Array(130), destinationMessage: null },
        signer,
      ),
    ).toThrow(/destination message/);
  });
});

describe("transaction packing", () => {
  const reclaims = [
    ...Array.from({ length: 12 }, (_, i) =>
      getReclaimInstruction(eventAccount("v1", i + 10), attestationFor("v1"), signer),
    ),
    ...Array.from({ length: 4 }, (_, i) =>
      getReclaimInstruction(eventAccount("v2", i + 40), attestationFor("v2"), signer),
    ),
  ];

  const plan = async (version: 0 | 1) => {
    const client = createClient({ payer: signer }).use(rpcTransactionPlanner({ version }));
    return flattenTransactionPlan(await client.planTransactions(reclaims)).map(
      (single) => single.message,
    );
  };

  test.each([0, 1] as const)(
    "v%i keeps every reclaim and every transaction under its size limit",
    async (version) => {
      const messages = await plan(version);
      expect(
        messages.reduce((sum, message) => sum + message.instructions.length, 0),
      ).toBeGreaterThanOrEqual(reclaims.length);
      for (const message of messages) {
        expect(getTransactionMessageSize(message)).toBeLessThanOrEqual(
          getTransactionMessageSizeLimit(message),
        );
      }
    },
  );

  test("v1 needs fewer signatures than v0", async () => {
    expect((await plan(1)).length).toBeLessThan((await plan(0)).length);
  });
});
