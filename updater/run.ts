import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { Connection } from "@solana/web3.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { countStats, Stats } from "../src/cctp/count";

const RPC_URL = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
const HISTORY_FILE = process.env.HISTORY_FILE ?? "history.json";
const INTERVAL_HOURS = Number(process.env.INTERVAL_HOURS ?? 24);
const PAUSE_MS = Number(process.env.STATS_PAUSE_MS ?? 250);
const HISTORY_DAYS = Number(process.env.HISTORY_DAYS ?? 90);
const RUN_LIMIT_MS = Number(process.env.RUN_LIMIT_MINUTES ?? 90) * 60_000;
const REPO_DIR = process.env.REPO_DIR ?? "";
const run = promisify(execFile);


const stamp = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const log = (line: string) => console.log(`${stamp()}  ${line}`);
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sol = (lamports: number) => (lamports / 1e9).toFixed(2);
const message = (error: unknown) => (error instanceof Error ? error.message : String(error));



interface Entry {
  at: number;
  stats: Stats;
}

interface Store {
  open(): Promise<void>;
  latest(): Promise<Stats | null>;
  record(stats: Stats): Promise<number>;
}

function read(): Entry[] {
  if (!existsSync(HISTORY_FILE)) return [];

  try {
    const parsed = JSON.parse(readFileSync(HISTORY_FILE, "utf8"));
    return Array.isArray(parsed) ? (parsed as Entry[]) : [];
  } catch {
    log("history file unreadable, starting a new one");
    return [];
  }
}

const fileStore: Store = {
  async open() {
    log(`history in ${HISTORY_FILE}`);
  },
  async latest() {
    const entries = read();
    return entries.length > 0 ? entries[entries.length - 1].stats : null;
  },
  async record(stats) {
    const now = Date.now();
    const kept = [...read(), { at: now, stats }].filter(
      (e) => e.at > now - HISTORY_DAYS * 86400_000
    );

    writeFileSync(`${HISTORY_FILE}.tmp`, JSON.stringify(kept));
    renameSync(`${HISTORY_FILE}.tmp`, HISTORY_FILE);
    return kept.length;
  },
};

const store: Store = fileStore;

async function pushToRepo(stats: Stats): Promise<void> {
  if (!REPO_DIR) return;

  const git = (...args: string[]) => run("git", ["-C", REPO_DIR, ...args]);

  await git("fetch", "--quiet", "origin", "main");
  await git("reset", "--hard", "--quiet", "origin/main");

  writeFileSync(`${REPO_DIR}/public/stats.json`, JSON.stringify(stats, null, 2) + "\n");

  const { stdout } = await git("status", "--porcelain", "public/stats.json");
  if (stdout.trim() === "") {
    log("stats unchanged, nothing to push");
    return;
  }

  await git("add", "public/stats.json");
  await git("commit", "--quiet", "-m", `chore: stats ${stats.generatedAt.slice(0, 10)}`);
  try {
    await git("push", "--quiet", "origin", "HEAD:main");
  } catch {
    log("push rejected, rebasing onto origin/main and retrying");
    await git("fetch", "--quiet", "origin", "main");
    await git("rebase", "--quiet", "origin/main");
    await git("push", "--quiet", "origin", "HEAD:main");
  }

  log("pushed stats.json, cloudflare will rebuild");
}

async function once(): Promise<void> {
  const started = Date.now();
  log(`counting via ${new URL(RPC_URL).host}`);

  const stats = await countStats(new Connection(RPC_URL, "confirmed"), PAUSE_MS, log);
  const seconds = Math.round((Date.now() - started) / 1000);

  let delta: number | null = null;
  try {
    const previous = await store.latest();
    if (previous) delta = stats.accounts - previous.accounts;
  } catch (error) {
    log(`history read failed: ${message(error)}`);
  }

  log(
    `counted in ${seconds}s: ${stats.accounts.toLocaleString()} accounts, ` +
      `${sol(stats.lamports)} SOL, ${stats.wallets.toLocaleString()} wallets` +
      (delta === null ? "" : ` (${delta >= 0 ? "+" : ""}${delta.toLocaleString()} since last run)`)
  );

  try {
    await pushToRepo(stats);
  } catch (error) {
    log(`git push failed: ${message(error)}`);
  }

  try {
    log(`history: ${await store.record(stats)} runs kept (${HISTORY_DAYS}d window)`);
  } catch (error) {
    log(`history write failed: ${message(error)}`);
  }
}

async function main(): Promise<void> {
  await store.open();

  log(`updater started, interval ${INTERVAL_HOURS}h`);

  for (;;) {
    try {
      await Promise.race([
        once(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("run exceeded time limit")), RUN_LIMIT_MS)
        ),
      ]);
    } catch (error) {
      log(`run failed: ${message(error)}`);
    }

    const next = new Date(Date.now() + INTERVAL_HOURS * 3600_000);
    log(`next run ${next.toISOString().replace("T", " ").slice(0, 19)}`);
    await sleep(INTERVAL_HOURS * 3600_000);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
