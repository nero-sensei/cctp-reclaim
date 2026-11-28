const ALLOWED = new Set([
  "getAccountInfo",
  "getBalance",
  "getEpochInfo",
  "getLatestBlockhash",
  "getMinimumBalanceForRentExemption",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getRecentPrioritizationFees",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getSlot",
  "isBlockhashValid",
  "sendTransaction",
  "simulateTransaction",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

function hasMemcmpFilter(params: unknown): boolean {
  const config: unknown = Array.isArray(params) ? params[1] : null;
  return (
    isRecord(config) &&
    Array.isArray(config.filters) &&
    config.filters.some((filter: unknown) => isRecord(filter) && isRecord(filter.memcmp))
  );
}

export function isAllowed(call: unknown): boolean {
  if (!isRecord(call) || typeof call.method !== "string" || !ALLOWED.has(call.method)) return false;
  return call.method !== "getProgramAccounts" || hasMemcmpFilter(call.params);
}
