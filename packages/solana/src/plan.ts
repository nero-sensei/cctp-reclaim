import {
  type Instruction,
  type Rpc,
  type SimulateTransactionApi,
  type TransactionSigner,
  createClient,
  estimateResourceLimitsFactory,
  flattenTransactionPlan,
} from "@solana/kit";
import { rpcTransactionPlanner } from "@solana/kit-plugin-rpc";

export async function printPlan(
  rpc: Rpc<SimulateTransactionApi>,
  payer: TransactionSigner,
  instructions: Instruction[],
  {
    maxInstructionsPerTransaction,
    simulate,
  }: { maxInstructionsPerTransaction: number; simulate: boolean },
): Promise<void> {
  const estimate = estimateResourceLimitsFactory({ rpc });

  for (const version of [1, 0] as const) {
    const client = createClient({ payer }).use(
      rpcTransactionPlanner({ version, maxInstructionsPerTransaction }),
    );
    const messages = flattenTransactionPlan(await client.planTransactions(instructions)).map(
      (plan) => plan.message,
    );
    console.log(
      `v${version}: ${instructions.length} instructions in ${messages.length} transaction(s)`,
    );

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
}
