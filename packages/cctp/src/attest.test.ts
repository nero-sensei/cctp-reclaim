import { describe, expect, test, vi, afterEach } from "vite-plus/test";
import { fetchAttestation } from "./attest.ts";
import { eventAccount } from "./fixtures.ts";

const rpcWithSignatures = (signatures: string[]) => ({
  getSignaturesForAddress: () => ({
    send: async () => signatures.map((signature) => ({ signature })),
  }),
});

const respond = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status })),
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("v1", () => {
  test("returns the attestation bytes once Circle marks it complete", async () => {
    respond(200, { status: "complete", attestation: "0xAABB" });
    expect(await fetchAttestation(rpcWithSignatures([]) as never, eventAccount("v1"))).toEqual({
      attestation: Uint8Array.of(0xaa, 0xbb),
      destinationMessage: null,
    });
  });

  test("returns null while pending or not found", async () => {
    respond(200, { status: "pending_confirmations", attestation: "PENDING" });
    expect(await fetchAttestation(rpcWithSignatures([]) as never, eventAccount("v1"))).toBeNull();
    respond(404, {});
    expect(await fetchAttestation(rpcWithSignatures([]) as never, eventAccount("v1"))).toBeNull();
  });

  test.each([["0x"], ["0xabc"], ["0xzz"], [null]])(
    "throws on an unreadable attestation %s",
    async (attestation) => {
      respond(200, { status: "complete", attestation });
      await expect(
        fetchAttestation(rpcWithSignatures([]) as never, eventAccount("v1")),
      ).rejects.toThrow(/unreadable/);
    },
  );
});

describe("v2", () => {
  test("looks up the message by the account's oldest transaction", async () => {
    respond(200, { messages: [{ status: "complete", attestation: "0x01", message: "0x0203" }] });
    const result = await fetchAttestation(
      rpcWithSignatures(["newest", "oldest"]) as never,
      eventAccount("v2"),
    );

    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toMatch(
      /\/v2\/messages\/5\?transactionHash=oldest$/,
    );
    expect(result).toEqual({
      attestation: Uint8Array.of(1),
      destinationMessage: Uint8Array.of(2, 3),
    });
  });

  test("returns null when the account has no history", async () => {
    respond(200, {});
    expect(await fetchAttestation(rpcWithSignatures([]) as never, eventAccount("v2"))).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  test("throws when a complete message has no destination message", async () => {
    respond(200, { messages: [{ status: "complete", attestation: "0x01" }] });
    await expect(
      fetchAttestation(rpcWithSignatures(["a"]) as never, eventAccount("v2")),
    ).rejects.toThrow(/unreadable message/);
  });
});
