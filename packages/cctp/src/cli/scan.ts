import {
  type Instruction,
  address,
  createNoopSigner,
  createSolanaRpc,
  decimalFixedPointToString,
  lamports,
  lamportsToSol,
} from "@solana/kit";
import { printPlan } from "@jigs/solana";
import {
  MAX_RECLAIMS_PER_TRANSACTION,
  fetchAttestation,
  findEventAccounts,
  getReclaimInstruction,
  isUnlocked,
} from "../index.ts";

const rpcUrl = process.env.RPC_URL;
const [wallet] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const simulate = process.argv.includes("--simulate");

if (!rpcUrl || !wallet) {
  console.error("usage: RPC_URL=<url> node src/cli/scan.ts <wallet> [--simulate]");
  process.exit(1);
}

const rpc = createSolanaRpc(rpcUrl);
const owner = createNoopSigner(address(wallet));
const accounts = await findEventAccounts(rpc, owner.address);
const total = lamports(accounts.reduce((sum, account) => sum + account.lamports, 0n));

console.log(`${accounts.length} accounts, ${decimalFixedPointToString(lamportsToSol(total))} SOL`);

const instructions: Instruction[] = [];
for (const account of accounts) {
  if (!isUnlocked(account)) {
    console.log(
      `locked ${account.address} until ${new Date((account.unlocksAt ?? 0) * 1000).toISOString()}`,
    );
    continue;
  }
  const attestation = await fetchAttestation(rpc, account);
  if (attestation) instructions.push(getReclaimInstruction(account, attestation, owner));
  else console.log(`awaiting attestation ${account.address}`);
}

if (instructions.length === 0) process.exit(0);

await printPlan(rpc, owner, instructions, {
  maxInstructionsPerTransaction: MAX_RECLAIMS_PER_TRANSACTION,
  simulate,
});
