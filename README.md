# Reclaim

Bridging USDC to Solana leaves your SOL behind. This gets it back.

Not the USDC — that arrived fine. To carry the transfer, Circle's CCTP opens an account on Solana
and you pay rent for it, about 0.003 SOL. The transfer completes, nobody closes the account, and
your rent stays locked in it.

```
893,200 accounts still open
  2,890 SOL locked inside them
257,168 wallets are owed some of it
```

No fees, no custody, no backend, no tracking. Your wallet signs; the rent goes back to it.
Your USDC is never touched.

## Verify it

```bash
curl -s "$RPC_URL" -H 'content-type: application/json' -d '{"jsonrpc":"2.0","id":1,
 "method":"getProgramAccounts","params":["CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd",
 {"encoding":"base64","dataSlice":{"offset":0,"length":0},
  "filters":[{"memcmp":{"offset":0,"bytes":"Nyg4DX4hvEf"}}]}]}'
```

That is CCTP V1. V2 is `CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC`.

## Run it

```bash
pnpm install
echo 'VITE_RPC_URL=https://your-provider/?api-key=...' > .env.local
pnpm dev
```

A provider endpoint is required — Solana's public RPC rejects `getProgramAccounts` from a browser.

```bash
pnpm test                                       # 17 tests
pnpm build                                      # static output in dist/
RPC_URL=<url> pnpm scan <wallet> --simulate     # simulate a claim, no private key
RPC_URL=<url> pnpm stats                        # regenerate public/stats.json
```

## How it works

One `getProgramAccounts` per version, filtered on the Anchor discriminator and the rent payer. No
indexer, no transaction history.

```
MessageSent   v1  8 disc | 32 rent_payer | 4 len | message
              v2  8 disc | 32 rent_payer | 8 created_at | 4 len | message
```

`reclaim_event_account` verifies a Circle attestation on-chain and refunds the payer. V1 claims any
time; V2 locks for 432,000s (error 6033 before that, measured on mainnet). V1 packs ~5 reclaims per
transaction, V2 one. Global totals are precomputed into `stats.json` because counting every account
means downloading 154 MB, then adjusted live over a WebSocket.

## Not affiliated

MIT licensed. Not affiliated with, endorsed by, or operated by Circle or Solana. USDC and CCTP are
trademarks of Circle. CCTP is a "Permissionless Product" under Circle's Developer Terms, which
permit third parties to build on it. Use at your own risk.
