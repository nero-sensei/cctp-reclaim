export const V1_RETIREMENT_BEGINS = Date.UTC(2026, 9, 31);
export const V1_RETIREMENT_COMPLETES = Date.UTC(2026, 11, 1);

export function daysUntil(target: number, now = Date.now()): number {
  return Math.max(0, Math.ceil((target - now) / 86_400_000));
}
