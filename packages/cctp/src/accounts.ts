import {
  type Address,
  type Base58EncodedBytes,
  type GetProgramAccountsApi,
  type Lamports,
  type ReadonlyUint8Array,
  type Rpc,
  getAddressDecoder,
  getBase58Decoder,
  getBase64Encoder,
} from "@solana/kit";
import {
  type CctpVersion,
  CREATED_AT_OFFSET,
  MESSAGE_SENT_DISCRIMINATOR,
  PROGRAMS,
  RECLAIM_WINDOW_SECONDS,
  RENT_PAYER_OFFSET,
  VERSIONS,
} from "./constants.ts";

export interface EventAccount {
  address: Address;
  version: CctpVersion;
  rentPayer: Address;
  lamports: Lamports;
  message: Uint8Array;
  unlocksAt: number | null;
}

export function base58Bytes(bytes: ReadonlyUint8Array): Base58EncodedBytes {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion
  return getBase58Decoder().decode(bytes) as Base58EncodedBytes;
}

export const discriminatorFilter = {
  memcmp: { offset: 0n, bytes: base58Bytes(MESSAGE_SENT_DISCRIMINATOR), encoding: "base58" },
} as const;

export function decodeEventAccount(
  version: CctpVersion,
  address: Address,
  lamports: Lamports,
  data: ReadonlyUint8Array,
): EventAccount {
  const { lengthOffset } = PROGRAMS[version];
  if (data.length < lengthOffset + 4) {
    throw new Error(`${address}: account data too short (${data.length})`);
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const length = view.getUint32(lengthOffset, true);
  const message = Uint8Array.from(data.subarray(lengthOffset + 4, lengthOffset + 4 + length));
  if (message.length !== length) {
    throw new Error(`${address}: truncated message (${message.length}/${length})`);
  }

  return {
    address,
    version,
    rentPayer: getAddressDecoder().decode(data.subarray(RENT_PAYER_OFFSET, RENT_PAYER_OFFSET + 32)),
    lamports,
    message,
    unlocksAt:
      version === "v2"
        ? Number(view.getBigInt64(CREATED_AT_OFFSET, true)) + RECLAIM_WINDOW_SECONDS
        : null,
  };
}

export function isUnlocked(account: EventAccount, now = Math.floor(Date.now() / 1000)): boolean {
  return account.unlocksAt === null || now >= account.unlocksAt;
}

export async function findEventAccounts(
  rpc: Rpc<GetProgramAccountsApi>,
  wallet: Address,
): Promise<EventAccount[]> {
  const found = await Promise.all(
    VERSIONS.map(async (version) => {
      const accounts = await rpc
        .getProgramAccounts(PROGRAMS[version].program, {
          encoding: "base64",
          filters: [
            discriminatorFilter,
            {
              memcmp: {
                offset: BigInt(RENT_PAYER_OFFSET),
                bytes: wallet,
                encoding: "base58",
              },
            },
          ],
        })
        .send();

      return accounts.map(({ pubkey, account }) =>
        decodeEventAccount(
          version,
          pubkey,
          account.lamports,
          getBase64Encoder().encode(account.data[0]),
        ),
      );
    }),
  );

  return found.flat();
}
