import {
  type Instruction,
  address,
  createClient,
  createNoopSigner,
  createSolanaRpc,
  decimalFixedPointToString,
  estimateResourceLimitsFactory,
  flattenTransactionPlan,
  lamports,
  lamportsToSol,
} from "@solana/kit";
import { rpcTransactionPlanner } from "@solana/kit-plugin-rpc";
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

const estimate = estimateResourceLimitsFactory({ rpc });

for (const version of [1, 0] as const) {
  const client = createClient({ payer: owner }).use(
    rpcTransactionPlanner({ version, maxInstructionsPerTransaction: MAX_RECLAIMS_PER_TRANSACTION }),
  );
  const messages = flattenTransactionPlan(await client.planTransactions(instructions)).map(
    (plan) => plan.message,
  );
  console.log(`v${version}: ${instructions.length} reclaims in ${messages.length} transaction(s)`);

  if (!simulate) continue;

  for (const [index, message] of messages.entries()) {
    const label = `  tx ${index + 1}/${messages.length}`;
    try {
      const { computeUnitLimit } = await estimate(message);
      console.log(`${label} ok, ${computeUnitLimit} CU`);
    } catch (error) {
      const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
      console.log(`${label} failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
}
