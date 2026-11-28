import { isRecord } from "./methods.ts";

const UNSUBSCRIBE = new Map([
  ["signatureSubscribe", "signatureUnsubscribe"],
  ["slotSubscribe", "slotUnsubscribe"],
]);
const UNSUBSCRIBES = new Set(UNSUBSCRIBE.values());

const MAX_FRAME_LENGTH = 4096;
const MAX_SUBSCRIPTIONS = 16;
const FRAME_BURST = 60;

type Id = string | number;

export interface Subscriptions {
  pending: Map<Id, string>;
  active: Map<unknown, string>;
  frames: number;
  opened: number;
}

export const subscriptions = (now = Date.now()): Subscriptions => ({
  pending: new Map(),
  active: new Map(),
  frames: 0,
  opened: now,
});

const isId = (value: unknown): value is Id =>
  typeof value === "string" || typeof value === "number";

const reply = (id: unknown, code: number, message: string) =>
  JSON.stringify({ jsonrpc: "2.0", id: isId(id) ? id : null, error: { code, message } });

function parse(frame: string): unknown {
  try {
    return JSON.parse(frame);
  } catch {
    return undefined;
  }
}

export function rejection(state: Subscriptions, frame: unknown, now = Date.now()): string | null {
  state.frames += 1;
  if (state.frames > FRAME_BURST + (now - state.opened) / 1000) {
    return reply(null, -32005, "rate limited");
  }
  if (typeof frame !== "string") return reply(null, -32600, "text frames only");
  if (frame.length > MAX_FRAME_LENGTH) return reply(null, -32600, "frame too large");
  const call = parse(frame);
  if (call === undefined) return reply(null, -32700, "parse error");
  if (!isRecord(call)) return reply(null, -32600, "invalid request");

  const { id, method, params } = call;
  if (method === "ping") return isId(id) ? reply(id, -32600, "invalid request") : null;
  if (!isId(id)) return reply(null, -32600, "id required");
  if (state.pending.has(id)) return reply(id, -32600, "id already pending");
  if (typeof method !== "string") return reply(id, -32600, "invalid request");

  const unsubscribe = UNSUBSCRIBE.get(method);
  if (unsubscribe) {
    if (state.pending.size + state.active.size >= MAX_SUBSCRIPTIONS) {
      return reply(id, -32005, "too many subscriptions");
    }
    state.pending.set(id, unsubscribe);
    return null;
  }

  if (UNSUBSCRIBES.has(method)) {
    const subscription: unknown = Array.isArray(params) ? params[0] : undefined;
    if (state.active.get(subscription) !== method) return reply(id, -32602, "unknown subscription");
    state.active.delete(subscription);
    state.pending.set(id, "");
    return null;
  }

  return reply(id, -32601, "method not allowed");
}

export function track(state: Subscriptions, frame: unknown): void {
  if (state.pending.size === 0 || typeof frame !== "string") return;
  const message = parse(frame);
  if (!isRecord(message) || !isId(message.id)) return;
  const unsubscribe = state.pending.get(message.id);
  if (unsubscribe === undefined) return;
  state.pending.delete(message.id);
  if (unsubscribe && "result" in message) state.active.set(message.result, unsubscribe);
}
