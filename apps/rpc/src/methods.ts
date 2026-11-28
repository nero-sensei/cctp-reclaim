const ALLOWED = new Set([
  "getAccountInfo",
  "getBalance",
  "getBlockHeight",
  "getEpochInfo",
  "getFeeForMessage",
  "getLatestBlockhash",
  "getMinimumBalanceForRentExemption",
  "getMultipleAccounts",
  "getProgramAccounts",
  "getRecentPrioritizationFees",
  "getSignatureStatuses",
  "getSignaturesForAddress",
  "getSlot",
  "getTokenAccountBalance",
  "getTokenAccountsByOwner",
  "getTransaction",
  "isBlockhashValid",
  "sendTransaction",
  "simulateTransaction",
]);

const MAX_BATCH = 20;

export function isAllowed(body: unknown): boolean {
  const calls = Array.isArray(body) ? body : [body];
  return (
    calls.length > 0 &&
    calls.length <= MAX_BATCH &&
    calls.every(
      (call: unknown) =>
        typeof call === "object" &&
        call !== null &&
        "method" in call &&
        typeof call.method === "string" &&
        ALLOWED.has(call.method),
    )
  );
}
