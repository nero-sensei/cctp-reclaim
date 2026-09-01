import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton, useWalletModal } from "@solana/wallet-adapter-react-ui";
import { EventAccount, RECLAIM_WINDOW_SECS, isUnlocked } from "./cctp";
import { V1_RETIREMENT_BEGINS } from "./deprecation";
import Footer from "./Footer";

const Docs = lazy(() => import("./Docs"));
const Report = lazy(() => import("./Report"));
import GlobalStats from "./Stats";
import { sol, usd } from "./format";
import { SOURCES } from "./sources";
import { useHardwareWallet, useTheme } from "./theme";
import {
  Amount,
  Bar,
  Button,
  COLUMNS,
  Checkbox,
  Check,
  Countdown,
  EASE,
  Logo,
  Progress,
  Reveal,
  Row,
  Skeleton,
  ThemeToggle,
} from "./ui";
import { MAX_BATCHES_PER_CLAIM, useClaim } from "./useClaim";
import { useLiveStats } from "./useLiveStats";
import { usePrice } from "./usePrice";

const WAITING_VISIBLE = 8;

const TITLES: Record<string, string> = {
  docs: "Docs · Reclaim",
  report: "Wallet report · Reclaim",
  claim: "Reclaim · CCTP rent on Solana",
};

const countdown = (seconds: number): string => {
  if (seconds <= 0) return "unlocking";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m ${seconds % 60}s`;
};

const useHash = (): string => {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return hash;
};

function Waiting({ accounts }: { accounts: EventAccount[] }) {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(timer);
  }, []);

  const sorted = useMemo(() => [...accounts].sort((a, b) => a.unlocksAt! - b.unlocksAt!), [accounts]);
  const visible = sorted.slice(0, WAITING_VISIBLE);

  return (
    <div className="flex flex-col gap-3">
      <h2 className="muted t-xs">Waiting to unlock</h2>
      <div className="flex flex-col gap-3.5">
        {visible.map((account) => {
          const left = account.unlocksAt! - now;
          const progress = Math.min(1, Math.max(0, 1 - left / RECLAIM_WINDOW_SECS));

          return (
            <div key={account.address.toBase58()} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className="t-xs tabular-nums">{sol(account.lamports)} SOL</span>
                <span className="faint t-2xs tabular-nums">{countdown(left)}</span>
              </div>
              <Bar progress={progress} />
            </div>
          );
        })}
      </div>
      <p className="faint t-2xs leading-relaxed">
        {sorted.length > visible.length && `${sorted.length - visible.length} more. `}
        CCTP V2 locks each deposit for 5 days. V1 has no wait.
      </p>
    </div>
  );
}

export default function App() {
  const { publicKey } = useWallet();
  const { setVisible } = useWalletModal();
  const { dark, toggle } = useTheme();
  const { hardware, setHardware } = useHardwareWallet();
  const claim = useClaim();
  const hash = useHash();
  const docs = hash === "#docs";
  const reportAddress = hash.startsWith("#w/") ? hash.slice(3) : null;
  const claimView = !docs && !reportAddress;
  const { scan, accounts, status, batches } = claim;
  const stats = useLiveStats();
  const price = usePrice();
  const rescannedAt = useRef(Date.now());
  const view = docs ? "docs" : reportAddress ? "report" : "claim";
  const region = useRef<HTMLDivElement>(null);
  const mounted = useRef(false);
  const reduce = useReducedMotion();

  const enter = reduce
    ? { initial: false as const, animate: {}, exit: {} }
    : {
        initial: { opacity: 0, y: 6 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -12, transition: { duration: 0.15, ease: "easeOut" as const } },
      };

  useEffect(() => {
    document.title = TITLES[view];
    if (mounted.current) region.current?.focus({ preventScroll: true });
    mounted.current = true;
  }, [view]);

  useEffect(() => {
    if (publicKey && claimView) scan();
  }, [publicKey, claimView, scan]);

  const waitingLocked = useMemo(() => accounts.filter((a) => !isUnlocked(a)), [accounts]);

  const planned = useMemo(
    () => new Set(batches.flatMap((b) => b.accounts.map((a) => a.address.toBase58()))),
    [batches]
  );

  const rescanIfUnlocked = useCallback(() => {
    if (status !== "ready" || Date.now() - rescannedAt.current < 60_000) return;

    const now = Math.floor(Date.now() / 1000);
    const missing = accounts.some((a) => isUnlocked(a, now) && !planned.has(a.address.toBase58()));

    if (missing) {
      rescannedAt.current = Date.now();
      scan();
    }
  }, [accounts, planned, scan, status]);

  useEffect(() => {
    const timer = setInterval(rescanIfUnlocked, 15_000);
    return () => clearInterval(timer);
  }, [rescanIfUnlocked]);

  const total = accounts.reduce((sum, a) => sum + a.lamports, 0);
  const settled = claim.signatures.length + claim.failed;
  const progress = batches.length === 0 ? 0 : settled / batches.length;
  const toUsd = (lamports: number) => (price === null ? null : (lamports / 1e9) * price);
  const scanning = status === "scanning";
  const succeeded = status === "done" && claim.claimed > 0 && !claim.error;
  const partial = status === "done" && claim.claimed > 0 && claim.error !== null;
  const showRecovered = succeeded || partial;
  const busy = status === "signing" || status === "claiming";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[420px] flex-col px-6 py-8 lg:max-w-[920px] lg:px-10 lg:py-10">
      <header className="mb-14 flex items-center justify-between lg:mb-20">
        <a href="#" className="-my-1.5 flex items-center gap-2 py-1.5">
          <Logo />
          <span className="t-sm font-medium tracking-[-0.02em]">Reclaim</span>
        </a>
        <div className="flex items-center gap-2">
          <ThemeToggle dark={dark} onToggle={toggle} />
          {claimView ? (
            <WalletMultiButton />
          ) : (
            <a href="#" className="muted -my-1.5 px-1 py-1.5 t-xs hover:text-[var(--fg)]">
              Back
            </a>
          )}
        </div>
      </header>

      <main
        className="flex flex-1 flex-col focus:outline-none focus-visible:rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--accent)]"
        ref={region}
        tabIndex={-1}
      >
        <p className="sr-only" role="status">
          {!claimView
            ? ""
            : status === "signing"
              ? "Waiting for your wallet"
              : status === "claiming"
                ? `Reclaiming ${Math.min(settled + 1, batches.length)} of ${batches.length}`
                : status === "done" && claim.claimed > 0
                  ? `Reclaimed ${claim.claimed} accounts`
                  : ""}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          {docs ? (
            <m.div key="docs" {...enter} transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}>
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <Docs />
              </Suspense>
            </m.div>
          ) : reportAddress ? (
            <m.div
              key="report"
              {...enter}
              transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
              className="flex flex-col"
            >
              <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                <Report address={reportAddress} />
              </Suspense>
            </m.div>
          ) : (
            <m.div
              key="claim"
              {...enter}
              transition={{ duration: reduce ? 0 : 0.4, ease: EASE }}
              className="flex flex-col"
            >
              <div className={COLUMNS}>
                <div>
                  <Reveal>
                    <h1 className="eyebrow">Unclaimed on Solana</h1>
                  </Reveal>

                  <Reveal delay={0.1}>
                    <div className="mt-4">
                      <Amount
                        dollars={stats && price ? (stats.lamports / 1e9) * price : null}
                        sol={stats ? sol(stats.lamports, 0) : "-"}
                      />
                    </div>
                  </Reveal>

                  <Reveal delay={0.14}>
                    <p className="muted mt-6 max-w-[38ch] t-sm leading-relaxed">
                      Every USDC bridge transfer rents a temporary account on Solana. The transfer
                      completes, the account stays open, and your rent stays locked in it.
                    </p>
                  </Reveal>

                  {!publicKey && (
                    <Reveal delay={0.18}>
                      <div className="mt-8 flex flex-col gap-3 lg:max-w-[300px]">
                        <Button onClick={claim.error ? scan : () => setVisible(true)}>
                          {claim.error ? "Try again" : "Check my wallet"}
                        </Button>
                        {claim.error && (
                          <span className="muted t-2xs" role="alert">
                            {claim.error}
                          </span>
                        )}
                      </div>
                    </Reveal>
                  )}
                </div>

                <Reveal delay={0.24}>
                  <div className="mt-12 flex flex-col lg:mt-0">
                    <h2 className="eyebrow">Retiring CCTP V1</h2>
                    <div className="mt-4">
                      <Countdown target={V1_RETIREMENT_BEGINS} />
                    </div>
                    <p className="faint mt-4 t-2xs leading-relaxed">
                      Starts 31 October 2026. Funds stay claimable, but new V1 activity ends.{" "}
                      <a
                        href={SOURCES[0].href}
                        target="_blank"
                        rel="noreferrer"
                        className="underline underline-offset-2 hover:text-[var(--fg)]"
                      >
                        Circle&apos;s announcement
                      </a>
                    </p>

                    <div className="mt-10">
                      <GlobalStats stats={stats} price={price} />
                    </div>
                  </div>
                </Reveal>
              </div>

              {publicKey && (
                <div className={`mt-12 ${COLUMNS}`}>
                  <div className="rule border-t pt-8">
                    <h2 className="eyebrow">
                      {succeeded ? "Reclaimed" : partial ? "Partly reclaimed" : "Your wallet"}
                    </h2>

                    {scanning ? (
                      <div className="mt-5 flex flex-col gap-5">
                        <Skeleton className="h-9 w-40" />
                        <Skeleton className="h-11 w-full lg:w-[300px]" />
                      </div>
                    ) : accounts.length === 0 ? (
                      <p className="muted mt-4 max-w-[38ch] t-sm leading-relaxed">
                        No open CCTP accounts here. Try the wallet you bridged with.
                      </p>
                    ) : (
                      <>
                        <div className="mt-4">
                          <Amount
                            dollars={toUsd(showRecovered ? claim.recovered : claim.claimable)}
                            sol={sol(showRecovered ? claim.recovered : claim.claimable)}
                            size="amount"
                          />
                        </div>

                        {claim.topUp > 0 && batches.length > 0 && (
                          <p
                            id="topup-reason"
                            className="muted mt-5 max-w-[38ch] t-xs leading-relaxed"
                          >
                            Send at least {sol(claim.topUp, 3)} SOL here first. Solana requires the
                            fee payer to keep a minimum balance.
                          </p>
                        )}

                        <div className="mt-6 flex flex-col gap-3 lg:max-w-[300px]">
                          {succeeded ? null : batches.length > 0 ? (
                            <>
                              {batches.length > 1 && !busy && status !== "done" && (
                                <Checkbox
                                  checked={hardware}
                                  onChange={setHardware}
                                  label="Using a hardware wallet"
                                  hint={
                                    hardware
                                      ? `${batches.length} approvals, one per transaction. Each is sent before the next, so none expire while you confirm on the device.`
                                      : `One approval covers all ${batches.length} transactions.`
                                  }
                                />
                              )}

                              <Button
                                onClick={claim.error ? scan : () => claim.claim(hardware)}
                                disabled={busy || claim.topUp > 0}
                                describedBy={claim.topUp > 0 ? "topup-reason" : undefined}
                              >
                                {status === "signing"
                                  ? hardware && batches.length > 1
                                    ? `Confirm ${claim.signingAt + 1} of ${batches.length} in your wallet`
                                    : "Confirm in your wallet"
                                  : status === "claiming"
                                    ? `Reclaiming ${Math.min(settled + 1, batches.length)} of ${batches.length}`
                                    : status === "done"
                                      ? "Scan again"
                                      : claim.error
                                        ? "Try again"
                                        : "Reclaim"}
                              </Button>
                              {status === "claiming" && <Progress value={progress} />}
                              {batches.length === MAX_BATCHES_PER_CLAIM && (
                                <span className="faint t-2xs">
                                  First {MAX_BATCHES_PER_CLAIM} transactions. Run again for the
                                  rest.
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="muted t-xs">
                              Nothing claimable yet. Attestations or the 5 day lock are still
                              pending.
                            </span>
                          )}

                          {claim.error && (
                            <span className="muted t-2xs" role="alert">
                              {claim.error}
                            </span>
                          )}


                        </div>

                        {showRecovered && (
                          <m.div
                            initial={reduce ? false : { opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, ease: EASE }}
                            className="mt-6 flex flex-col items-start gap-4"
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="text-[var(--success)]">
                                <Check />
                              </span>
                              <span className="t-sm">
                                {claim.claimed} account{claim.claimed === 1 ? "" : "s"} closed
                              </span>
                            </div>
                            {partial && (
                              <span className="muted t-xs leading-relaxed">
                                {claim.failed} of {claim.failed + claim.signatures.length}{" "}
                                transactions failed.
                              </span>
                            )}

                            <div className="flex items-center gap-4">
                              {claim.signatures[0] && (
                                <a
                                  href={`https://solscan.io/tx/${claim.signatures[0]}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="muted t-xs underline underline-offset-4 hover:text-[var(--fg)]"
                                >
                                  View transaction
                                </a>
                              )}
                              <button
                                onClick={scan}
                                className="muted t-xs underline underline-offset-4 hover:text-[var(--fg)]"
                              >
                                Scan again
                              </button>
                            </div>
                          </m.div>
                        )}

                      </>
                    )}
                  </div>

                  {accounts.length > 0 && (
                    <div className="mt-10 flex flex-col lg:mt-0 lg:pt-8">
                      <h2 className="eyebrow">This wallet</h2>
                      <div className="rule mt-4 flex flex-col border-t">
                        <Row label="Accounts" value={accounts.length.toLocaleString()} />
                        <Row
                          label="Locked in total"
                          value={price ? `$${usd(toUsd(total)!)}` : "-"}
                          sub={`${sol(total)} SOL`}
                        />
                        <Row
                          label="Transactions"
                          value={batches.length === 0 ? "-" : String(batches.length)}
                        />
                        {claim.pending > 0 && (
                          <Row label="Awaiting attestation" value={String(claim.pending)} />
                        )}
                        {claim.skipped > 0 && <Row label="Skipped" value={String(claim.skipped)} />}
                      </div>

                      {waitingLocked.length > 0 && (
                        <div className="mt-8">
                          <Waiting accounts={waitingLocked} />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </m.div>
          )}
        </AnimatePresence>
      </main>

      <div className="mt-16">
        <Footer />
      </div>
    </div>
  );
}
