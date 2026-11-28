import {
  type AccountMeta,
  AccountRole,
  type AccountSignerMeta,
  type Instruction,
  type TransactionSigner,
  addEncoderSizePrefix,
  fixEncoderSize,
  getBytesEncoder,
  getStructEncoder,
  getU32Encoder,
} from "@solana/kit";
import type { EventAccount } from "./accounts.ts";
import type { Attestation } from "./attest.ts";
import { PROGRAMS, RECLAIM_DISCRIMINATOR } from "./constants.ts";

const discriminator = fixEncoderSize(getBytesEncoder(), RECLAIM_DISCRIMINATOR.length);
const sizePrefixed = addEncoderSizePrefix(getBytesEncoder(), getU32Encoder());
const v1Data = getStructEncoder([
  ["discriminator", discriminator],
  ["attestation", sizePrefixed],
]);
const v2Data = getStructEncoder([
  ["discriminator", discriminator],
  ["attestation", sizePrefixed],
  ["destinationMessage", sizePrefixed],
]);

export function getReclaimInstruction(
  account: EventAccount,
  { attestation, destinationMessage }: Attestation,
  rentPayer: TransactionSigner,
): Instruction<string, readonly (AccountMeta | AccountSignerMeta)[]> {
  if (rentPayer.address !== account.rentPayer) {
    throw new Error(
      `${account.address}: rent payer is ${account.rentPayer}, not ${rentPayer.address}`,
    );
  }

  let data;
  if (account.version === "v1") {
    data = v1Data.encode({ discriminator: RECLAIM_DISCRIMINATOR, attestation });
  } else if (destinationMessage) {
    data = v2Data.encode({ discriminator: RECLAIM_DISCRIMINATOR, attestation, destinationMessage });
  } else {
    throw new Error(`${account.address}: v2 reclaim needs a destination message`);
  }

  const { program, state } = PROGRAMS[account.version];
  return {
    programAddress: program,
    accounts: [
      { address: rentPayer.address, role: AccountRole.WRITABLE_SIGNER, signer: rentPayer },
      { address: state, role: AccountRole.WRITABLE },
      { address: account.address, role: AccountRole.WRITABLE },
    ],
    data,
  };
}
