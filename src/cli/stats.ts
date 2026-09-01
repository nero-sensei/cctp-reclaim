import { writeFileSync } from "node:fs";
import { Connection } from "@solana/web3.js";
import { countStats } from "../cctp/count";

async function main(): Promise<void> {
  const rpc =
    process.env.RPC_URL ?? process.env.SOLANA_RPC_URL ?? "https://api.mainnet-beta.solana.com";

  console.log(`counting via ${new URL(rpc).host}`);

  const started = Date.now();
  const stats = await countStats(
    new Connection(rpc, "confirmed"),
    Number(process.env.STATS_PAUSE_MS ?? 250)
  );

  writeFileSync("public/stats.json", JSON.stringify(stats, null, 2) + "\n");
  console.log(`counted in ${Math.round((Date.now() - started) / 1000)}s`, stats);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
