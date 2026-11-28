import { type Address, getAddressDecoder, lamports, none, some } from "@solana/kit";
import {
  AccountState,
  type ExtensionArgs,
  type TokenArgs,
  getTokenEncoder,
} from "@solana-program/token-2022";

export const owner = getAddressDecoder().decode(new Uint8Array(32).fill(1));
export const addressOf = (seed: number): Address =>
  getAddressDecoder().decode(new Uint8Array(32).fill(seed));
export const MINIMUM = lamports(1_488_440n);
export const OLD_RENT = lamports(2_039_280n);

export function tokenData(overrides: Partial<TokenArgs> = {}, extensions?: ExtensionArgs[]) {
  return getTokenEncoder().encode({
    mint: addressOf(2),
    owner,
    amount: 0n,
    delegate: none(),
    state: AccountState.Initialized,
    isNative: none(),
    delegatedAmount: 0n,
    closeAuthority: none(),
    extensions: extensions ? some(extensions) : none(),
    ...overrides,
  });
}
