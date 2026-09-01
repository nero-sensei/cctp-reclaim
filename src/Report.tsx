import { useEffect, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { PublicKey } from "@solana/web3.js";
import { EventAccount, isUnlocked, scanWallet, totalLamports } from "./cctp";
import { friendlyError } from "./errors";
import { sol } from "./format";
import GlobalStats from "./Stats";
import { useLiveStats } from "./useLiveStats";
import { Amount, Button, COLUMNS, Reveal, Row, Skeleton } from "./ui";
import { usePrice } from "./usePrice";

export default function Report({ address }: { address: string }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const price = usePrice();
  const stats = useLiveStats();
  const [accounts, setAccounts] = useState<EventAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setAccounts(null);
    setError(null);

    try {
      const owner = new PublicKey(address);
      scanWallet(connection, owner)
        .then((found) => active && setAccounts(found))
        .catch((e) => active && setError(friendlyError(e)));
    } catch {
      setError("That is not a valid Solana address.");
    }

    return () => {
      active = false;
    };
  }, [address, attempt, connection]);

  const total = accounts ? totalLamports(accounts) : 0;
  const ready = accounts ? accounts.filter((a) => isUnlocked(a)) : [];
  const dollars = price === null ? null : (total / 1e9) * price;
  const isOwner = publicKey?.toBase58() === address;

  return (
    <div className={COLUMNS}>
      <div>
        <Reveal>
          <h1 className="eyebrow">Rent this wallet can reclaim</h1>
        </Reveal>

        {error ? (
          <div className="mt-6 flex flex-col gap-3 lg:max-w-[300px]" role="alert">
            <span className="muted t-sm">{error}</span>
            <Button onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
          </div>
        ) : !accounts ? (
          <div className="mt-5 flex flex-col gap-5">
            <Skeleton className="h-16 w-52" />
            <Skeleton className="h-24 w-full lg:w-[300px]" />
          </div>
        ) : (
          <>
            <Reveal delay={0.06}>
              <div className="mt-4">
                <Amount dollars={dollars} sol={sol(total)} />
              </div>
            </Reveal>

            <Reveal delay={0.12}>
              <div className="rule mt-6 flex flex-col border-t">
                <Row label="Accounts" value={accounts.length.toLocaleString()} />
                <Row label="Claimable now" value={ready.length.toLocaleString()} />
                <Row
                  label="Waiting 5 days"
                  value={(accounts.length - ready.length).toLocaleString()}
                />
                <Row label="Wallet" value={`${address.slice(0, 4)}…${address.slice(-4)}`} />
              </div>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="mt-8 flex flex-col gap-3 lg:max-w-[300px]">
                {isOwner ? (
                  <Button onClick={() => (window.location.hash = "")}>Reclaim it</Button>
                ) : !publicKey ? (
                  <Button onClick={() => setVisible(true)}>Connect this wallet to reclaim</Button>
                ) : null}

                <p className="muted t-xs leading-relaxed">
                  Only this wallet can close these accounts. Anyone can verify the number with one
                  getProgramAccounts call.
                </p>
              </div>
            </Reveal>
          </>
        )}
      </div>

      <div className="mt-12 lg:mt-0">
        <GlobalStats stats={stats} price={price} />
      </div>
    </div>
  );
}
