# AGENTS.md

Rules for every human and agent working in this repo. Short on purpose. Read all of it before changing anything.

## What this is

jigs: small tools served at jigs.fyi. One tool, one problem, kept small.

## Layout

| Path              | What                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/cctp`   | Finds the CCTP message accounts a wallet paid rent for, fetches Circle attestations, builds reclaim instructions. `scan` and `stats` CLIs                                  |
| `packages/rent`   | Finds a wallet's token accounts (Token and Token-2022): closes empty ones, withdraws excess rent from the rest, skips what it must not touch. `scan` CLI                   |
| `packages/solana` | Shared Solana helpers used by more than one tool. Today: plan and simulate instructions for the CLIs                                                                       |
| `apps/rpc`        | Cloudflare Worker at `rpc.jigs.fyi`. Rotates Solana RPC upstreams with failover, origin and method allowlists, per-IP rate limit, WebSocket subscription allowlist and cap |

Adding a tool:

- Logic goes in `packages/<name>`: no UI, exported from `src/index.ts`, `exports` pointing at source.
- Anything deployed goes in `apps/<name>`. Tools live at `jigs.fyi/<slug>`. A subdomain only when it needs its own server.
- Code moves into a shared package only when a second consumer exists.
- Removing a tool means deleting its folders and its row above. Nothing else may break.

## Stack

Don't swap any of these without asking.

| Area      | Choice                                                                                                                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime   | Node 26 LTS (`.node-version`). TypeScript runs directly through type stripping: no tsx, no build step for packages                        |
| Packages  | pnpm 12. Every version lives in the catalog in `pnpm-workspace.yaml` (`catalogMode: strict`)                                              |
| Toolchain | Vite+ (`vp`): Oxfmt, Oxlint with type-aware rules, TypeScript 7, Vitest. Config in the root `vite.config.ts`                              |
| Solana    | `@solana/kit` 8 and its plugins. Wallets through Wallet Standard (`@solana/kit-plugin-wallet`). No `@solana/web3.js`, no `wallet-adapter` |
| Frontends | Astro with React islands, static, on Cloudflare Workers assets                                                                            |
| Workers   | Wrangler, `wrangler.jsonc`. Secrets through `wrangler secret put`, never in `vars`                                                        |

## Commands

`vp` is the Vite+ CLI. Without a global install, use `pnpm exec vp`.

```bash
pnpm install                      # also generates Worker runtime types
pnpm ready                        # vp check + all tests
vp check                          # format, lint, type-check
vp check --fix
vp run -r test
vp run @jigs/rpc#dev              # needs apps/rpc/.dev.vars with RPC_URLS and ALLOWED_ORIGINS
RPC_URL=<url> vp run @jigs/cctp#scan <wallet> --simulate
RPC_URL=<url> vp run @jigs/cctp#stats
RPC_URL=<url> vp run @jigs/rent#scan <wallet> --simulate
```

## Code rules

- Simplest code that works. If a reviewer needs a minute to follow it, rewrite it.
- No comments. One exception: a single line for a unit or a non-obvious invariant. Lint directives are fine. Delete every other comment before showing a diff.
- Small files with one job. Match the neighbouring file.
- No new dependency, abstraction, helper or file without a concrete second use. No speculative features, flags or config.
- Kit moves fast. Read the installed `.d.ts` before using an API, never write it from memory.
- Everything from the network (RPC, Circle, wallets, request bodies) is `unknown` until narrowed. No `as` outside tests, except narrowing to a Kit nominal type that has no constructor.
- Amounts are `bigint` lamports end to end. Never floats.
- Transactions: return instructions, let the Kit planner pack them. Plan v1 when the wallet supports it, v0 otherwise. Cap instructions per transaction by measured compute, not just bytes, and simulate before claiming a batch size works.
- Every behaviour change ships with a test that fails before and passes after. Tests try to break things: wrong signer, wrong offset, truncated data, boundaries, failover, leaked secrets. No tests that restate the code.
- No dead code, debug logs, unused exports or commented-out code.

## Safety

- Public repo. Never commit secrets, keyed RPC URLs, hostnames, IPs, personal notes, plans or unshipped ideas. Notes go in gitignored `.docs/`, research in `.research/`.
- Never read `.env*` or `.dev.vars`.
- Never sign or send a mainnet transaction. Simulate instead.
- One branch per change in `.worktrees/<name>`, Conventional Commits, PR to `main`. The maintainer merges. Never force-push.
- No Dependabot or Renovate. Upgrades are by hand: bump the catalog, `vp check`, tests.
- No CI, no bots, no required checks. `pnpm ready` passing locally is the gate before every push.

## Before you say done

- Run `pnpm ready`. Say what ran and what didn't.
- Re-read the whole diff as a hostile reviewer. Get a fresh-context review for anything that builds transactions or touches the RPC proxy.
