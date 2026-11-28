import type { Instruction, TransactionSigner } from "@solana/kit";
import {
  getCloseAccountInstruction,
  getWithdrawExcessLamportsInstruction,
} from "@solana-program/token-2022";
import type { Reclaim } from "./accounts.ts";

// Kit maximum; message bytes and the 64-account limit bind first
export const MAX_RECLAIMS_PER_TRANSACTION = 64;

export function getReclaimInstruction(reclaim: Reclaim, owner: TransactionSigner): Instruction {
  const config = { programAddress: reclaim.program };
  return reclaim.action === "close"
    ? getCloseAccountInstruction(
        { account: reclaim.address, destination: owner.address, owner },
        config,
      )
    : getWithdrawExcessLamportsInstruction(
        { source: reclaim.address, destination: owner.address, authority: owner },
        config,
      );
}
