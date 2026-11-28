import {
  type Address,
  type GetMinimumBalanceForRentExemptionApi,
  type GetTokenAccountsByOwnerApi,
  type Lamports,
  type ReadonlyUint8Array,
  type Rpc,
  getBase64Encoder,
  isSome,
  lamports,
} from "@solana/kit";
import {
  AccountState,
  TOKEN_2022_PROGRAM_ADDRESS,
  TOKEN_PROGRAM_ADDRESS,
  type Token,
  getTokenDecoder,
  isExtension,
} from "@solana-program/token-2022";

export interface Reclaim {
  address: Address;
  program: Address;
  mint: Address;
  action: "close" | "withdraw";
  lamports: Lamports;
}

export interface Skipped {
  address: Address;
  mint: Address | null;
  reason: string;
}

export interface TokenAccount {
  address: Address;
  program: Address;
  balance: Lamports;
  data: ReadonlyUint8Array;
  minimum: Lamports;
}

const PROGRAMS = [TOKEN_PROGRAM_ADDRESS, TOKEN_2022_PROGRAM_ADDRESS];
const MIN_WITHDRAW = 5_000n;

function canClose(token: Token, owner: Address): boolean {
  if (token.amount > 0n || token.state === AccountState.Frozen) return false;
  if (isSome(token.closeAuthority) && token.closeAuthority.value !== owner) return false;
  const extensions = isSome(token.extensions) ? token.extensions.value : [];
  return !extensions.some(
    (extension) =>
      (isExtension("TransferFeeAmount", extension) && extension.withheldAmount > 0n) ||
      isExtension("ConfidentialTransferAccount", extension) ||
      isExtension("ConfidentialTransferFeeAmount", extension),
  );
}

export function classify(account: TokenAccount, owner: Address): Reclaim | Skipped | null {
  const { address, program, balance, data, minimum } = account;
  let token: Token;
  try {
    token = getTokenDecoder().decode(data);
  } catch {
    return { address, mint: null, reason: "unreadable" };
  }

  const skip = (reason: string): Skipped => ({ address, mint: token.mint, reason });
  if (token.owner !== owner) return skip("owned by another wallet");
  if (canClose(token, owner)) {
    return { address, program, mint: token.mint, action: "close", lamports: balance };
  }
  if (isSome(token.isNative)) return skip(token.amount > 0n ? "holds wrapped SOL" : "cannot close");

  const excess = balance - minimum;
  if (excess < MIN_WITHDRAW) return token.state === AccountState.Frozen ? skip("frozen") : null;
  return { address, program, mint: token.mint, action: "withdraw", lamports: lamports(excess) };
}

export async function findReclaims(
  rpc: Rpc<GetTokenAccountsByOwnerApi & GetMinimumBalanceForRentExemptionApi>,
  owner: Address,
): Promise<{ reclaims: Reclaim[]; skipped: Skipped[] }> {
  const minimums = new Map<number, Promise<Lamports>>();
  const minimum = (size: number) => {
    let value = minimums.get(size);
    if (!value) {
      value = rpc.getMinimumBalanceForRentExemption(BigInt(size)).send();
      minimums.set(size, value);
    }
    return value;
  };

  const results = await Promise.all(
    PROGRAMS.map(async (program) => {
      const { value } = await rpc
        .getTokenAccountsByOwner(owner, { programId: program }, { encoding: "base64" })
        .send();
      return Promise.all(
        value.map(async ({ pubkey, account }) => {
          const data = getBase64Encoder().encode(account.data[0]);
          const balance = account.lamports;
          return classify(
            { address: pubkey, program, balance, data, minimum: await minimum(data.length) },
            owner,
          );
        }),
      );
    }),
  );

  const reclaims: Reclaim[] = [];
  const skipped: Skipped[] = [];
  for (const result of results.flat()) {
    if (!result) continue;
    if ("reason" in result) skipped.push(result);
    else reclaims.push(result);
  }
  return { reclaims, skipped };
}
