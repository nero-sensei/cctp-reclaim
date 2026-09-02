import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  CctpVersion,
  Claimable,
  MESSAGE_SENT_DISCRIMINATOR,
  PROGRAMS,
  RENT_PAYER_OFFSET,
  buildTransaction,
  fetchAttestation,
  isUnlocked,
  planBatches,
  requiredBalance,
  scanWallet,
  totalLamports,
} from "../cctp";
import { sol } from "../format";
import { sleep } from "./util";

async function payerCounts(
  connection: Connection,
  version: CctpVersion
): Promise<Map<string, number>> {
  const accounts = await connection.getProgramAccounts(PROGRAMS[version].program, {
    dataSlice: { offset: RENT_PAYER_OFFSET, length: 32 },
    filters: [{ memcmp: { offset: 0, bytes: bs58.encode(MESSAGE_SENT_DISCRIMINATOR) } }],
  });

  const counts = new Map<string, number>();
  for (const { account } of accounts) {
    const payer = new PublicKey(account.data).toBase58();
    counts.set(payer, (counts.get(payer) ?? 0) + 1);
  }
  return counts;
}

function pick(counts: Map<string, number>, wallets: number, max: number): string[] {
  const eligible = [...counts.entries()]
    .filter(([, count]) => count >= 1 && count <= max)
    .map(([payer]) => payer);

  const chosen: string[] = [];
  while (chosen.length < wallets && eligible.length > 0) {
    const index = Math.floor(Math.random() * eligible.length);
    chosen.push(eligible.splice(index, 1)[0]);
  }
  return chosen;
}

async function check(connection: Connection, wallet: string): Promise<boolean> {
  const owner = new PublicKey(wallet);
  const accounts = await scanWallet(connection, owner);
  const unlocked = accounts.filter((a) => isUnlocked(a));
  const claimables: Claimable[] = [];

  for (const account of unlocked) {
    const attestation = await fetchAttestation(connection, account);
    if (attestation) claimables.push({ account, attestation });
    await sleep(150);
  }

  const label = `${wallet.slice(0, 8)}… ${accounts.length} accts ${sol(totalLamports(accounts))} SOL`;

  if (claimables.length === 0) {
    console.log(`${label} · nothing claimable (locked or awaiting attestation)`);
    return true;
  }

  const batches = planBatches(claimables, owner);
  const balance = await connection.getBalance(owner);

  if (balance < requiredBalance(batches.map((b) => b.accounts.length))) {
    console.log(`${label} · underfunded, balance ${sol(balance)} SOL`);
    return true;
  }

  const { blockhash } = await connection.getLatestBlockhash();
  let failures = 0;

  for (const batch of batches) {
    const { value } = await connection.simulateTransaction(
      buildTransaction(batch, owner, blockhash),
      { sigVerify: false, replaceRecentBlockhash: true, commitment: "processed" }
    );
    if (value.err) {
      failures += 1;
      console.log(`  ${wallet.slice(0, 8)}… batch failed ${JSON.stringify(value.err)}`);
    }
  }

  console.log(
    `${label} · ${batches.length} tx · ${sol(batches.reduce((s, b) => s + b.lamports, 0))} SOL · ${
      failures === 0 ? "all ok" : `${failures} failed`
    }`
  );
  return failures === 0;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const version = (args.find((a) => a.startsWith("--version="))?.split("=")[1] ?? "v1") as CctpVersion;
  const wallets = Number(args.find((a) => a.startsWith("--wallets="))?.split("=")[1] ?? 5);
  const max = Number(args.find((a) => a.startsWith("--max="))?.split("=")[1] ?? 8);
  const rpc = process.env.RPC_URL ?? process.env.SOLANA_RPC_URL;

  if (!rpc) {
    console.error("usage: RPC_URL=<url> sample [--version=v1|v2] [--wallets=N] [--max=N]");
    process.exit(1);
  }

  const connection = new Connection(rpc, "confirmed");
  const counts = await payerCounts(connection, version);
  const chosen = pick(counts, wallets, max);

  console.log(`${version}: ${counts.size} payers, sampling ${chosen.length}\n`);

  const results = [];
  for (const wallet of chosen) {
    results.push(await check(connection, wallet));
  }

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} wallets simulated clean`);
  if (passed !== results.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
