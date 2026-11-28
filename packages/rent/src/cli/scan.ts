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
import { MAX_RECLAIMS_PER_TRANSACTION, findReclaims, getReclaimInstruction } from "../index.ts";

const rpcUrl = process.env.RPC_URL;
const [wallet] = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
const simulate = process.argv.includes("--simulate");

if (!rpcUrl || !wallet) {
  console.error("usage: RPC_URL=<url> node src/cli/scan.ts <wallet> [--simulate]");
  process.exit(1);
}

const sol = (value: bigint) => decimalFixedPointToString(lamportsToSol(lamports(value)));
const rpc = createSolanaRpc(rpcUrl);
const owner = createNoopSigner(address(wallet));
const { reclaims, skipped } = await findReclaims(rpc, owner.address);

for (const action of ["close", "withdraw"] as const) {
  const matching = reclaims.filter((reclaim) => reclaim.action === action);
  const total = matching.reduce((sum, reclaim) => sum + reclaim.lamports, 0n);
  console.log(`${action}: ${matching.length} accounts, ${sol(total)} SOL`);
}
for (const { address: account, reason } of skipped) console.log(`skip ${account}: ${reason}`);

const instructions: Instruction[] = reclaims.map((reclaim) =>
  getReclaimInstruction(reclaim, owner),
);
if (instructions.length > 0) {
  await printPlan(rpc, owner, instructions, {
    maxInstructionsPerTransaction: MAX_RECLAIMS_PER_TRANSACTION,
    simulate,
  });
}
