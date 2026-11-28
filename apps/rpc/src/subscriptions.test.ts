import { describe, expect, test } from "vite-plus/test";
import { rejection, subscriptions, track, type Subscriptions } from "./subscriptions.ts";

const frame = (method: string, id: unknown = 1, params: unknown[] = []) =>
  JSON.stringify({ jsonrpc: "2.0", id, method, params });

const error = (reply: string | null) => JSON.parse(reply ?? "null");

function subscribe(state: Subscriptions, id: number, result: unknown = id + 100) {
  expect(rejection(state, frame("slotSubscribe", id))).toBeNull();
  track(state, JSON.stringify({ jsonrpc: "2.0", id, result }));
}

describe("allowed", () => {
  test.each(["signatureSubscribe", "slotSubscribe"])("forwards %s", (method) => {
    expect(rejection(subscriptions(), frame(method, 1, ["x"]))).toBeNull();
  });

  test("forwards kit's id-less ping", () => {
    expect(
      rejection(subscriptions(), JSON.stringify({ jsonrpc: "2.0", method: "ping" })),
    ).toBeNull();
  });

  test("forwards an unsubscribe for a subscription upstream confirmed", () => {
    const state = subscriptions();
    subscribe(state, 1, 42);
    expect(rejection(state, frame("slotUnsubscribe", 2, [42]))).toBeNull();
    expect(state.active.size).toBe(0);
  });
});

describe("rejected", () => {
  test.each([
    "logsSubscribe",
    "programSubscribe",
    "blockSubscribe",
    "rootSubscribe",
    "voteSubscribe",
    "slotsUpdatesSubscribe",
    "getBalance",
    "sendTransaction",
  ])("%s with the id echoed", (method) => {
    const reply = error(rejection(subscriptions(), frame(method, "abc", ["all"])));
    expect(reply).toEqual({
      jsonrpc: "2.0",
      id: "abc",
      error: { code: -32601, message: "method not allowed" },
    });
  });

  test.each([
    ["non-JSON", "{nope", -32700],
    ["a batch", `[${frame("slotSubscribe")}]`, -32600],
    ["an empty batch", "[]", -32600],
    ["a bare value", "42", -32600],
    ["null", "null", -32600],
    ["a call without a method", JSON.stringify({ jsonrpc: "2.0", id: 1 }), -32600],
    ["a binary frame", new ArrayBuffer(8), -32600],
  ])("%s", (_label, data, code) => {
    expect(error(rejection(subscriptions(), data)).error.code).toBe(code);
  });

  test("a frame over 4 KB", () => {
    const fits = frame("slotSubscribe", 1, ["x".repeat(4000)]);
    expect(rejection(subscriptions(), fits)).toBeNull();
    expect(error(rejection(subscriptions(), `${fits}${" ".repeat(200)}`)).error.message).toBe(
      "frame too large",
    );
  });

  test.each([
    ["a ping with an id", frame("ping", "x")],
    [
      "an unsubscribe without an id",
      JSON.stringify({ jsonrpc: "2.0", method: "slotUnsubscribe", params: [1] }),
    ],
    ["accountSubscribe", frame("accountSubscribe", 1, ["x"])],
  ])("%s", (_label, data) => {
    expect(rejection(subscriptions(), data)).not.toBeNull();
  });

  test("a subscribe without an id, which upstream would never confirm", () => {
    const state = subscriptions();
    const reply = rejection(state, JSON.stringify({ jsonrpc: "2.0", method: "slotSubscribe" }));
    expect(error(reply).id).toBeNull();
    expect(state.pending.size).toBe(0);
  });

  test("an object id is not echoed", () => {
    expect(error(rejection(subscriptions(), frame("logsSubscribe", { x: 1 }))).id).toBeNull();
  });
});

describe("subscription cap", () => {
  test("allows 16 active or pending subscriptions, then refuses", () => {
    const state = subscriptions();
    for (let id = 1; id <= 8; id++) subscribe(state, id);
    for (let id = 9; id <= 16; id++)
      expect(rejection(state, frame("slotSubscribe", id))).toBeNull();
    const reply = error(rejection(state, frame("signatureSubscribe", 17, ["x"])));
    expect(reply).toMatchObject({ id: 17, error: { code: -32005 } });
  });

  test("unsubscribing frees a slot", () => {
    const state = subscriptions();
    for (let id = 1; id <= 16; id++) subscribe(state, id);
    expect(rejection(state, frame("slotSubscribe", 17))).not.toBeNull();
    expect(rejection(state, frame("slotUnsubscribe", 18, [101]))).toBeNull();
    expect(rejection(state, frame("slotSubscribe", 19))).not.toBeNull();
    track(state, JSON.stringify({ jsonrpc: "2.0", id: 18, result: true }));
    expect(rejection(state, frame("slotSubscribe", 20))).toBeNull();
  });

  test("a failed subscribe frees its slot", () => {
    const state = subscriptions();
    expect(rejection(state, frame("slotSubscribe", 1))).toBeNull();
    track(
      state,
      JSON.stringify({ jsonrpc: "2.0", id: 1, error: { code: -32602, message: "bad" } }),
    );
    expect([state.pending.size, state.active.size]).toEqual([0, 0]);
  });

  test("notifications and unrelated replies do not touch the count", () => {
    const state = subscriptions();
    subscribe(state, 1);
    expect(rejection(state, frame("slotSubscribe", 2))).toBeNull();
    for (const message of [
      JSON.stringify({ jsonrpc: "2.0", method: "slotNotification", params: { subscription: 101 } }),
      JSON.stringify({ jsonrpc: "2.0", id: 99, result: 5 }),
      "not json",
      new ArrayBuffer(4),
    ]) {
      track(state, message);
    }
    expect([state.pending.size, state.active.size]).toEqual([1, 1]);
  });

  test.each([
    ["an unknown subscription id", frame("slotUnsubscribe", 9, [999])],
    ["the subscription id as a string", frame("slotUnsubscribe", 9, ["101"])],
    ["the wrong unsubscribe method", frame("signatureUnsubscribe", 9, [101])],
    ["missing params", JSON.stringify({ jsonrpc: "2.0", id: 9, method: "slotUnsubscribe" })],
  ])("bogus unsubscribes cannot free slots: %s", (_label, data) => {
    const state = subscriptions();
    for (let id = 1; id <= 16; id++) subscribe(state, id);
    expect(error(rejection(state, data))).toMatchObject({ id: 9, error: { code: -32602 } });
    expect(rejection(state, frame("slotSubscribe", 17))).not.toBeNull();
  });

  test("the same subscription cannot be unsubscribed twice", () => {
    const state = subscriptions();
    subscribe(state, 1);
    expect(rejection(state, frame("slotUnsubscribe", 2, [101]))).toBeNull();
    expect(rejection(state, frame("slotUnsubscribe", 3, [101]))).not.toBeNull();
  });

  test("reusing a pending id cannot hide a subscription", () => {
    const state = subscriptions();
    expect(rejection(state, frame("slotSubscribe", 1))).toBeNull();
    for (const method of ["slotSubscribe", "slotUnsubscribe", "ping"]) {
      expect(error(rejection(state, frame(method, 1, [101])))).toMatchObject({
        id: 1,
        error: { code: -32600 },
      });
    }
    expect(state.pending.size).toBe(1);
  });

  test("an unsubscribe reply cannot be counted as a subscription", () => {
    const state = subscriptions();
    subscribe(state, 1);
    expect(rejection(state, frame("slotUnsubscribe", "x", [101]))).toBeNull();
    expect(error(rejection(state, frame("slotSubscribe", "x")))).toMatchObject({
      error: { code: -32600 },
    });
    track(state, JSON.stringify({ jsonrpc: "2.0", id: "x", result: true }));
    expect([state.pending.size, state.active.size]).toEqual([0, 0]);
  });
});

describe("frame budget", () => {
  test("allows a burst of 60 frames, then one per second", () => {
    const state = subscriptions(0);
    const ping = JSON.stringify({ jsonrpc: "2.0", method: "ping" });
    for (let i = 0; i < 60; i++) expect(rejection(state, ping, 0)).toBeNull();
    expect(error(rejection(state, ping, 0)).error.code).toBe(-32005);
    expect(rejection(state, ping, 5_000)).toBeNull();
  });
});
