import { Connection, PublicKey } from "@solana/web3.js";
import { buildTransaction, Claimable, fetchAttestation, isUnlocked, planBatches, scanWallet, totalLamports } from "../cctp";
import { sol } from "../format";
import { sleep } from "./util";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const wallet = args.find((a: string) => !a.startsWith("--"));
  const simulate = args.includes("--simulate");
  const limit = Number(args.find((a: string) => a.startsWith("--limit="))?.split("=")[1] ?? 25);
  const rpc = process.env.RPC_URL ?? process.env.SOLANA_RPC_URL;

  if (!wallet || !rpc) {
    console.error("usage: RPC_URL=<url> scan <wallet> [--simulate] [--limit=N]");
    process.exit(1);
  }

  const connection = new Connection(rpc, "confirmed");
  const owner = new PublicKey(wallet);
  const accounts = await scanWallet(connection, owner);

  if (accounts.length === 0) {
    console.log("nothing to reclaim");
    return;
  }

  const unlocked = accounts.filter((a) => isUnlocked(a));
  const locked = accounts.filter((a) => !isUnlocked(a));

  console.log(`${accounts.length} accounts · ${sol(totalLamports(accounts))} SOL`);
  console.log(`ready ${unlocked.length} · ${sol(totalLamports(unlocked))} SOL`);

  for (const account of locked) {
    console.log(`locked ${account.address.toBase58()} until ${new Date(account.unlocksAt! * 1000).toISOString()}`);
  }

  const claimables: Claimable[] = [];
  let pending = 0;

  for (const account of unlocked.slice(0, limit)) {
    const attestation = await fetchAttestation(connection, account);
    if (attestation) claimables.push({ account, attestation });
    else pending += 1;
    await sleep(250);
  }

  if (pending > 0) console.log(`${pending} awaiting attestation`);
  if (claimables.length === 0) return;

  const batches = planBatches(claimables, owner);
  const total = batches.reduce((sum, b) => sum + b.lamports, 0);
  console.log(`${batches.length} transaction(s) · ${claimables.length} accounts · ${sol(total)} SOL`);

  if (!simulate) return;

  const { blockhash } = await connection.getLatestBlockhash();

  for (const [i, batch] of batches.entries()) {
    const { value } = await connection.simulateTransaction(
      buildTransaction(batch, owner, blockhash),
      { sigVerify: false, replaceRecentBlockhash: true, commitment: "processed" }
    );
    const label = `tx ${i + 1}/${batches.length} (${batch.accounts.length})`;
    console.log(value.err ? `${label} failed ${JSON.stringify(value.err)}` : `${label} ok`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
