import {
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { EventAccount } from "./accounts";
import { Attestation } from "./attest";
import {
  CU_MARGIN,
  CU_PER_ACCOUNT,
  MAX_TX_BYTES,
  MIN_PRIORITY_FEE,
  PROGRAMS,
  RECLAIM_DISCRIMINATOR,
} from "./constants";

export interface Claimable {
  account: EventAccount;
  attestation: Attestation;
}

export interface Batch {
  instructions: TransactionInstruction[];
  accounts: EventAccount[];
  lamports: number;
}

const DUMMY_BLOCKHASH = PublicKey.default.toBase58();

const u32 = (value: number): Buffer => {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value, 0);
  return buffer;
};

export function buildReclaimInstruction({
  account,
  attestation,
}: Claimable): TransactionInstruction {
  const { program, state } = PROGRAMS[account.version];
  const parts = [
    RECLAIM_DISCRIMINATOR,
    u32(attestation.attestation.length),
    attestation.attestation,
  ];

  if (account.version === "v2") {
    if (!attestation.destinationMessage) {
      throw new Error(`${account.address.toBase58()}: v2 reclaim needs a destination message`);
    }
    parts.push(u32(attestation.destinationMessage.length), attestation.destinationMessage);
  }

  return new TransactionInstruction({
    programId: program,
    keys: [
      { pubkey: account.rentPayer, isSigner: true, isWritable: true },
      { pubkey: state, isSigner: false, isWritable: true },
      { pubkey: account.address, isSigner: false, isWritable: true },
    ],
    data: Buffer.concat(parts),
  });
}

const budget = (count: number, microLamports: number): TransactionInstruction[] => [
  ComputeBudgetProgram.setComputeUnitLimit({ units: count * CU_PER_ACCOUNT + CU_MARGIN }),
  ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
];

const compile = (
  instructions: TransactionInstruction[],
  feePayer: PublicKey,
  blockhash: string,
  microLamports: number
): VersionedTransaction =>
  new VersionedTransaction(
    new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: blockhash,
      instructions: [...budget(instructions.length, microLamports), ...instructions],
    }).compileToV0Message()
  );

const sizeOf = (instructions: TransactionInstruction[], feePayer: PublicKey): number => {
  try {
    return compile(instructions, feePayer, DUMMY_BLOCKHASH, MIN_PRIORITY_FEE)
      .message.serialize().length + 65;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

export function buildTransaction(
  batch: Batch,
  feePayer: PublicKey,
  blockhash: string,
  microLamports: number = MIN_PRIORITY_FEE
): VersionedTransaction {
  return compile(batch.instructions, feePayer, blockhash, microLamports);
}

export function planBatches(claimables: Claimable[], feePayer: PublicKey): Batch[] {
  const ordered = [...claimables].sort((a, b) => a.account.version.localeCompare(b.account.version));
  const batches: Batch[] = [];
  let current: Batch = { instructions: [], accounts: [], lamports: 0 };

  for (const claimable of ordered) {
    const instruction = buildReclaimInstruction(claimable);

    if (
      current.instructions.length > 0 &&
      sizeOf([...current.instructions, instruction], feePayer) > MAX_TX_BYTES
    ) {
      batches.push(current);
      current = { instructions: [], accounts: [], lamports: 0 };
    }

    if (current.instructions.length === 0 && sizeOf([instruction], feePayer) > MAX_TX_BYTES) {
      continue;
    }

    current.instructions.push(instruction);
    current.accounts.push(claimable.account);
    current.lamports += claimable.account.lamports;
  }

  if (current.instructions.length > 0) batches.push(current);
  return batches;
}
