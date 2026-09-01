import { useCallback, useEffect, useRef, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  Batch,
  Claimable,
  EventAccount,
  buildTransaction,
  fetchAttestation,
  isUnlocked,
  planBatches,
  priorityFee,
  scanWallet,
  topUpNeeded,
} from "./cctp";
import { RPC_URL } from "./config";
import { friendlyError } from "./errors";

export const MAX_BATCHES_PER_CLAIM = 25;

export type Status = "idle" | "scanning" | "ready" | "signing" | "claiming" | "done";

interface State {
  status: Status;
  accounts: EventAccount[];
  batches: Batch[];
  pending: number;
  skipped: number;
  topUp: number;
  attempting: number;
  signingAt: number;
  signatures: string[];
  claimed: number;
  recovered: number;
  failed: number;
  error: string | null;
}

const initial: State = {
  status: "idle",
  accounts: [],
  batches: [],
  pending: 0,
  skipped: 0,
  topUp: 0,
  attempting: 0,
  signingAt: 0,
  signatures: [],
  claimed: 0,
  recovered: 0,
  failed: 0,
  error: null,
};

export function useClaim() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, signAllTransactions } = useWallet();
  const [state, setState] = useState<State>(initial);
  const request = useRef(0);
  const inFlight = useRef<string | null>(null);
  const busy = useRef(false);
  const wallet = useRef<string | null>(null);

  const key = publicKey?.toBase58() ?? null;

  useEffect(() => {
    if (wallet.current === key) return;

    wallet.current = key;
    request.current += 1;
    inFlight.current = null;
    busy.current = false;
    setState(initial);
  }, [key]);

  const scan = useCallback(async () => {
    if (!publicKey || busy.current) return;

    const owner = publicKey;
    const address = owner.toBase58();
    if (inFlight.current === address) return;

    inFlight.current = address;
    const id = ++request.current;
    const current = () => id === request.current;

    setState((s) => ({ ...s, status: "scanning", error: null }));

    try {
      const [accounts, balance] = await Promise.all([
        scanWallet(connection, owner),
        connection.getBalance(owner),
      ]);

      const claimables: Claimable[] = [];
      let pending = 0;
      let skipped = 0;

      for (const account of accounts.filter((a) => isUnlocked(a))) {
        if (!current()) return;

        try {
          const attestation = await fetchAttestation(connection, account);
          if (attestation) claimables.push({ account, attestation });
          else pending += 1;
        } catch {
          skipped += 1;
        }
      }

      const planned = claimables.length > 0 ? planBatches(claimables, owner) : [];
      skipped += claimables.length - planned.reduce((sum, b) => sum + b.accounts.length, 0);

      if (!current()) return;

      const batches = planned.slice(0, MAX_BATCHES_PER_CLAIM);

      setState({
        ...initial,
        status: "ready",
        accounts,
        batches,
        pending,
        skipped,
        topUp: topUpNeeded(balance, batches.length),
      });
    } catch (error) {
      if (!current()) return;
      console.error(error);
      setState((s) => ({ ...s, status: "ready", error: friendlyError(error) }));
    } finally {
      if (inFlight.current === address) inFlight.current = null;
    }
  }, [connection, publicKey]);

  const claim = useCallback(async (oneAtATime = false) => {
    if (!publicKey || state.batches.length === 0 || busy.current) return;

    const id = ++request.current;
    const current = () => id === request.current;

    busy.current = true;
    setState((s) => ({
      ...s,
      status: "signing",
      attempting: state.batches.length,
      signingAt: 0,
      claimed: 0,
      recovered: 0,
      failed: 0,
      signatures: [],
      error: null,
    }));

    let last: unknown = null;
    let signed = 0;

    const chunk = oneAtATime || !signAllTransactions ? 1 : state.batches.length;

    for (let start = 0; start < state.batches.length; start += chunk) {
      if (!current()) {
        busy.current = false;
        return;
      }

      const group = state.batches.slice(start, start + chunk);
      let transactions;

      try {
        setState((s) => ({ ...s, status: "signing", signingAt: start }));

        const [{ blockhash }, fee] = await Promise.all([
          connection.getLatestBlockhash(),
          priorityFee(connection, RPC_URL),
        ]);
        transactions = group.map((b) => buildTransaction(b, publicKey, blockhash, fee));

        if (signAllTransactions) transactions = await signAllTransactions(transactions);
      } catch (error) {
        console.error(error);
        last = error;
        break;
      }

      if (!current()) {
        busy.current = false;
        return;
      }

      signed += group.length;
      let rejected = false;
      setState((s) => ({ ...s, status: "claiming" }));

      await Promise.all(
        transactions.map(async (transaction, index) => {
          try {
            const signature = signAllTransactions
              ? await connection.sendRawTransaction(transaction.serialize())
              : await sendTransaction(transaction, connection);

            await connection.confirmTransaction(signature, "confirmed");

            if (current()) {
              const closed = new Set(group[index].accounts.map((a) => a.address.toBase58()));

              setState((s) => ({
                ...s,
                signatures: [...s.signatures, signature],
                claimed: s.claimed + group[index].accounts.length,
                recovered: s.recovered + group[index].lamports,
                accounts: s.accounts.filter((a) => !closed.has(a.address.toBase58())),
                batches: s.batches.filter((b) => b !== group[index]),
              }));
            }
          } catch (error) {
            console.error(error);
            last = error;
            rejected = true;
            if (current()) setState((s) => ({ ...s, failed: s.failed + 1 }));
          }
        })
      );

      if (rejected && !signAllTransactions) break;
    }

    busy.current = false;
    if (!current()) return;

    if (signed === 0) {
      setState((s) => ({ ...s, status: "ready", error: friendlyError(last) }));
      return;
    }

    setState((s) => ({
      ...s,
      status: "done",
      error: s.failed > 0 || last !== null ? friendlyError(last) : null,
    }));
  }, [connection, publicKey, sendTransaction, signAllTransactions, state.batches]);

  return {
    ...state,
    claimable: state.batches.reduce((sum, b) => sum + b.lamports, 0),
    scan,
    claim,
  };
}
