import { isRecord } from "./methods.ts";

const UNSUBSCRIBE = new Map([
  ["accountSubscribe", "accountUnsubscribe"],
  ["signatureSubscribe", "signatureUnsubscribe"],
  ["slotSubscribe", "slotUnsubscribe"],
]);
const UNSUBSCRIBES = new Set(UNSUBSCRIBE.values());

const MAX_FRAME_BYTES = 4 * 1024;
const MAX_SUBSCRIPTIONS = 16;

type Id = string | number;

export interface Subscriptions {
  pending: Map<Id, string>;
  active: Map<unknown, string>;
}

export const subscriptions = (): Subscriptions => ({ pending: new Map(), active: new Map() });

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

export function rejection(state: Subscriptions, frame: unknown): string | null {
  if (typeof frame !== "string") return reply(null, -32600, "text frames only");
  if (new TextEncoder().encode(frame).byteLength > MAX_FRAME_BYTES) {
    return reply(null, -32600, "frame too large");
  }
  const call = parse(frame);
  if (call === undefined) return reply(null, -32700, "parse error");
  if (!isRecord(call)) return reply(null, -32600, "invalid request");

  const { id, method, params } = call;
  if (isId(id) && state.pending.has(id)) return reply(id, -32600, "id already pending");
  if (method === "ping") return null;
  if (typeof method !== "string") return reply(id, -32600, "invalid request");

  const unsubscribe = UNSUBSCRIBE.get(method);
  if (unsubscribe) {
    if (!isId(id)) return reply(null, -32600, "id required");
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
    return null;
  }

  return reply(id, -32601, "method not allowed");
}

export function track(state: Subscriptions, frame: unknown): void {
  if (state.pending.size === 0 || typeof frame !== "string") return;
  const message = parse(frame);
  if (!isRecord(message) || !isId(message.id)) return;
  const unsubscribe = state.pending.get(message.id);
  if (!unsubscribe) return;
  state.pending.delete(message.id);
  if ("result" in message) state.active.set(message.result, unsubscribe);
}
