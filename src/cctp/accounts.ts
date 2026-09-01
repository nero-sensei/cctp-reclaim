import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  CctpVersion,
  MESSAGE_SENT_DISCRIMINATOR,
  MIN_TOP_UP,
  PROGRAMS,
  RECLAIM_WINDOW_SECS,
  RENT_EXEMPT_MINIMUM,
  RENT_PAYER_OFFSET,
  SIGNATURE_FEE,
} from "./constants";

export interface EventAccount {
  address: PublicKey;
  version: CctpVersion;
  rentPayer: PublicKey;
  lamports: number;
  message: Buffer;
  createdAt: number | null;
  unlocksAt: number | null;
}

const CREATED_AT_OFFSET = RENT_PAYER_OFFSET + 32;

export function decodeEventAccount(
  version: CctpVersion,
  address: PublicKey,
  lamports: number,
  data: Buffer
): EventAccount {
  const { lenOffset } = PROGRAMS[version];

  if (data.length < lenOffset + 4) {
    throw new Error(`${address.toBase58()}: account data too short (${data.length})`);
  }

  const msgLen = data.readUInt32LE(lenOffset);
  const message = data.subarray(lenOffset + 4, lenOffset + 4 + msgLen);

  if (message.length !== msgLen) {
    throw new Error(`${address.toBase58()}: truncated message (${message.length}/${msgLen})`);
  }

  const createdAt = version === "v2" ? Number(data.readBigInt64LE(CREATED_AT_OFFSET)) : null;

  return {
    address,
    version,
    rentPayer: new PublicKey(data.subarray(RENT_PAYER_OFFSET, RENT_PAYER_OFFSET + 32)),
    lamports,
    message,
    createdAt,
    unlocksAt: createdAt === null ? null : createdAt + RECLAIM_WINDOW_SECS,
  };
}

export function isUnlocked(account: EventAccount, now = Math.floor(Date.now() / 1000)): boolean {
  return account.unlocksAt === null || now >= account.unlocksAt;
}

export async function scanWallet(
  connection: Connection,
  wallet: PublicKey
): Promise<EventAccount[]> {
  const versions: CctpVersion[] = ["v1", "v2"];

  const found = await Promise.all(
    versions.map(async (version) => {
      const accounts = await connection.getProgramAccounts(PROGRAMS[version].program, {
        filters: [
          { memcmp: { offset: 0, bytes: bs58.encode(MESSAGE_SENT_DISCRIMINATOR) } },
          { memcmp: { offset: RENT_PAYER_OFFSET, bytes: wallet.toBase58() } },
        ],
      });

      return accounts.map(({ pubkey, account }) =>
        decodeEventAccount(version, pubkey, account.lamports, account.data)
      );
    })
  );

  return found.flat();
}

export function totalLamports(accounts: EventAccount[]): number {
  return accounts.reduce((sum, a) => sum + a.lamports, 0);
}

export function requiredBalance(batches: number): number {
  return RENT_EXEMPT_MINIMUM + SIGNATURE_FEE * Math.max(1, batches);
}

export function topUpNeeded(balance: number, batches: number): number {
  return balance >= requiredBalance(batches) ? 0 : MIN_TOP_UP;
}
