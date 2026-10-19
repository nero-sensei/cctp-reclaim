import {
  type Blockhash,
  ComputeBudgetProgram,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import type { EventAccount } from "./accounts";
import type { Attestation } from "./attest";
import {
  CU_MARGIN,
  CU_PER_ACCOUNT,
  MAX_CU_PER_TX,
  MAX_LOADED_ACCOUNTS_DATA,
  MAX_TX_BYTES,
  MAX_V1_TX_BYTES,
  MIN_PRIORITY_FEE,
  PROGRAMS,
  RECLAIM_DISCRIMINATOR,
} from "./constants";
import { computeUnits, priorityLamports } from "./fees";

export type TxVersion = 0 | 1;

export interface Claimable {
  account: EventAccount;
  attestation: Attestation;
}

export interface Batch {
  instructions: TransactionInstruction[];
  accounts: EventAccount[];
  lamports: number;
  version: TxVersion;
}

const DUMMY_BLOCKHASH = PublicKey.default.toBase58() as string as Blockhash;
const MAX_PER_TX = Math.floor((MAX_CU_PER_TX - CU_MARGIN) / CU_PER_ACCOUNT);

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

const compile = (
  instructions: TransactionInstruction[],
  feePayer: PublicKey,
  blockhash: Blockhash,
  microLamports: number,
  version: TxVersion
): VersionedTransaction => {
  const units = computeUnits(instructions.length);

  if (version === 1) {
    return new VersionedTransaction(
      new TransactionMessage({ payerKey: feePayer, recentBlockhash: blockhash, instructions })
        .compileToV1Message({
          computeUnitLimit: units,
          loadedAccountsDataSizeLimit: MAX_LOADED_ACCOUNTS_DATA,
          priorityFeeLamports: BigInt(priorityLamports(instructions.length, microLamports)),
        })
    );
  }

  return new VersionedTransaction(
    new TransactionMessage({
      payerKey: feePayer,
      recentBlockhash: blockhash,
      instructions: [
        ComputeBudgetProgram.setComputeUnitLimit({ units }),
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports }),
        ...instructions,
      ],
    }).compileToV0Message()
  );
};

const sizeOf = (
  instructions: TransactionInstruction[],
  feePayer: PublicKey,
  version: TxVersion
): number => {
  try {
    return compile(instructions, feePayer, DUMMY_BLOCKHASH, MIN_PRIORITY_FEE, version).serialize()
      .length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

export function buildTransaction(
  batch: Batch,
  feePayer: PublicKey,
  blockhash: Blockhash,
  microLamports: number = MIN_PRIORITY_FEE
): VersionedTransaction {
  return compile(batch.instructions, feePayer, blockhash, microLamports, batch.version);
}

export function planBatches(
  claimables: Claimable[],
  feePayer: PublicKey,
  version: TxVersion = 0
): Batch[] {
  const limit = version === 1 ? MAX_V1_TX_BYTES : MAX_TX_BYTES;
  const ordered = [...claimables].sort((a, b) => a.account.version.localeCompare(b.account.version));
  const batches: Batch[] = [];
  const empty = (): Batch => ({ instructions: [], accounts: [], lamports: 0, version });
  let current = empty();

  for (const claimable of ordered) {
    const instruction = buildReclaimInstruction(claimable);

    if (
      current.instructions.length > 0 &&
      (current.instructions.length >= MAX_PER_TX ||
        current.accounts[0].version !== claimable.account.version ||
        sizeOf([...current.instructions, instruction], feePayer, version) > limit)
    ) {
      batches.push(current);
      current = empty();
    }

    if (current.instructions.length === 0 && sizeOf([instruction], feePayer, version) > limit) {
      continue;
    }

    current.instructions.push(instruction);
    current.accounts.push(claimable.account);
    current.lamports += claimable.account.lamports;
  }

  if (current.instructions.length > 0) batches.push(current);
  return batches;
}
