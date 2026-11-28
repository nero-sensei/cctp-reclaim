import { createSolanaRpc, decimalFixedPointToString, lamports, lamportsToSol } from "@solana/kit";
import { countOpenAccounts } from "../index.ts";

const rpcUrl = process.env.RPC_URL;
if (!rpcUrl) {
  console.error("usage: RPC_URL=<url> node src/cli/stats.ts");
  process.exit(1);
}

const totals = await countOpenAccounts(createSolanaRpc(rpcUrl), {
  log: (line) => console.error(line),
});

console.log(
  JSON.stringify(
    totals,
    (_key, value) =>
      typeof value === "bigint" ? decimalFixedPointToString(lamportsToSol(lamports(value))) : value,
    2,
  ),
);
