import { stringify } from "./format";

const PROGRAM_ERRORS: Record<number, string> = {
  6001: "Circle has paused this CCTP program, so it can't close accounts.",
  6032: "Circle returned a message that no longer matches this account.",
  6033: "This account is still inside its 5 day lock.",
};

const describe = (error: unknown): string => {
  const parts: string[] = [];
  let current = error;

  for (let depth = 0; current != null && depth < 5; depth++) {
    if (current instanceof Error) parts.push(current.message);
    parts.push(typeof current === "object" ? stringify(current) : String(current));
    current = (current as { cause?: unknown }).cause;
  }

  return parts.join(" ");
};

export function friendlyError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null
        ? stringify(error)
        : String(error);
  const text = describe(error);
  const lower = text.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("rejected the request")) {
    return "Signature cancelled.";
  }
  if (lower.includes("insufficientfundsforrent") || lower.includes("insufficient funds")) {
    return "Not enough SOL to cover the network fee. Send a little SOL to this wallet first.";
  }
  if (
    lower.includes("blockheight") ||
    lower.includes("expired") ||
    lower.includes("timed out") ||
    lower.includes("blockhash not found") ||
    lower.includes("blockhashnotfound")
  ) {
    return "The network was busy and the transaction expired. Try again.";
  }
  if (lower.includes("access forbidden") || lower.includes("403")) {
    return "The RPC endpoint refused this request.";
  }
  if (lower.includes("429") || lower.includes("rate limit")) {
    return "Too many requests. Wait a moment and try again.";
  }
  if (lower.includes("failed to fetch") || lower.includes("networkerror")) {
    return "Network problem. Check your connection and try again.";
  }
  if (lower.includes("already been processed") || lower.includes("accountnotinitialized")) {
    return "Already claimed. Rescan to refresh.";
  }

  const hex = text.match(/custom program error: 0x([0-9a-f]+)/i);
  const decimal = text.match(/"Custom"\s*:\s*(\d+)/);
  const code = hex ? parseInt(hex[1], 16) : decimal ? Number(decimal[1]) : null;
  if (code !== null && PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code];

  return message.length > 120 ? "Something went wrong. Nothing was lost, try again." : message;
}
