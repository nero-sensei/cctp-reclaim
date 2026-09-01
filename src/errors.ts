const PROGRAM_ERRORS: Record<number, string> = {
  6001: "Circle has paused the program. Try again later.",
  6032: "Circle returned a message that no longer matches this account.",
  6033: "This account is still inside its 5 day lock.",
};

export function friendlyError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("user rejected") || lower.includes("rejected the request")) {
    return "Signature cancelled.";
  }
  if (lower.includes("insufficientfundsforrent") || lower.includes("insufficient funds")) {
    return "Not enough SOL to cover the network fee. Send a little SOL to this wallet first.";
  }
  if (lower.includes("blockheight") || lower.includes("expired") || lower.includes("timed out")) {
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

  const hex = message.match(/custom program error: 0x([0-9a-f]+)/i);
  const decimal = message.match(/"Custom"\s*:\s*(\d+)/);
  const code = hex ? parseInt(hex[1], 16) : decimal ? Number(decimal[1]) : null;
  if (code !== null && PROGRAM_ERRORS[code]) return PROGRAM_ERRORS[code];

  return message.length > 120 ? "Something went wrong. Nothing was lost, try again." : message;
}
