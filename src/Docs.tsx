import { m, useReducedMotion } from "motion/react";
import { V1_RETIREMENT_COMPLETES, daysUntil } from "./deprecation";
import { LINKS } from "./Footer";
import { SOURCES } from "./sources";
import { EASE } from "./ui";

const AUTOMATIC = [
  {
    title: "Your USDC already arrived",
    body: "The bridge finished the transfer and delivered it. That part worked, and this site never touches it.",
  },
  {
    title: "Solana charged you rent",
    body: "To carry the transfer message it opened a temporary account, and every Solana account has to be paid for. About 0.003 SOL of your own money, held as rent.",
  },
  {
    title: "Nobody closed the account",
    body: "Once the USDC lands the bridge has no reason to go back. The account stays open and the rent stays locked in it. It is still yours.",
  },
];

function Diagram() {
  const reduce = useReducedMotion();

  return (
    <div className="flex flex-col">
      <p className="faint mb-4 t-2xs">Happens automatically when you bridge</p>

      <ol className="flex flex-col">
        {AUTOMATIC.map((step, index) => (
          <li key={step.title} className="flex gap-4">
            <div className="flex flex-col items-center pt-[6px]">
              <span className="h-[5px] w-[5px] shrink-0 rounded-full bg-[var(--faint)]" />
              <m.span
                className="w-px flex-1 bg-[var(--line)]"
                initial={reduce ? false : { scaleY: 0 }}
                animate={{ scaleY: 1 }}
                style={{ originY: 0 }}
                transition={{ duration: 0.5, ease: EASE, delay: 0.12 * index }}
              />
            </div>

            <div className="pb-6">
              <p className="muted t-xs font-medium">{step.title}</p>
              <p className="faint mt-1 t-xs leading-relaxed">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex gap-4">
        <div className="flex flex-col items-center pt-[5px]">
          <span className="h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--accent)]" />
        </div>

        <div>
          <p className="accent t-2xs">This is the only part we do</p>
          <p className="mt-1.5 t-base font-medium">Close the account, get the rent back</p>
          <p className="muted mt-1.5 t-sm leading-relaxed">
            We find every account you paid rent on, fetch the proof Circle requires to close it, and
            hand your wallet a transaction. The rent returns to you. Your USDC is not involved and
            nothing about the original transfer changes.
          </p>
        </div>
      </div>
    </div>
  );
}

const VERSIONS = [
  {
    name: "CCTP V1",
    rule: "Claim any time",
    detail: "No waiting period. The program checks the attestation and closes the account.",
  },
  {
    name: "CCTP V2",
    rule: "Locked 5 days",
    detail:
      "Exactly 432,000 seconds from the transfer, enforced on-chain. Trying earlier fails with error 6033. The account records when it was created, so the countdown is public.",
  },
];

const FACTS = [
  ["Whose money is it", "Yours. You paid the rent when you bridged."],
  ["Who can claim it", "Only the wallet that paid. Enforced on-chain."],
  ["What we take", "Nothing. No fee, no cut, no custody."],
  ["Why wallets miss it", "It is not a token account, so cleanup tools cannot see it."],
  ["Why some wait", "Newer transfers lock for exactly 5 days."],
  ["Why an empty wallet cannot", "Solana needs the fee payer to keep a minimum balance."],
];

function Retirement() {
  const completes = daysUntil(V1_RETIREMENT_COMPLETES);

  return (
    <div className="flex flex-col gap-4">
      <p className="muted t-xs leading-relaxed">
        Retirement starts on 31 October 2026 and completes on 1 December 2026, {completes} days
        from now. Circle states access to funds is not lost during the phase out. What ends is new
        activity on V1, so the pile of unclaimed rent stops growing.
      </p>
      <div className="flex flex-col gap-2">
        <span className="faint t-2xs">Read it from Circle</span>
        {SOURCES.map((source) => (
          <a
            key={source.href}
            href={source.href}
            target="_blank"
            rel="noreferrer"
            className="muted t-xs underline underline-offset-4 hover:text-[var(--fg)]"
          >
            {source.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3.5">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

function Code({ children }: { children: string }) {
  return (
    <pre className="rule muted scroller overflow-x-auto rounded-lg border p-4 t-2xs leading-[1.7]">
      {children}
    </pre>
  );
}

export default function Docs() {
  return (
    <div className="flex flex-col gap-10">
      <h1 className="sr-only">How CCTP rent reclaim works</h1>

      <Section title="What happens to your SOL">
        <Diagram />
      </Section>

      <Section title="Two versions, two rules">
        <div className="flex flex-col">
          {VERSIONS.map((version) => (
            <div key={version.name} className="rule flex flex-col gap-1.5 border-b py-3.5 last:border-b-0">
              <div className="flex items-baseline justify-between gap-4">
                <span className="t-sm font-medium">{version.name}</span>
                <span className="accent t-xs">{version.rule}</span>
              </div>
              <span className="muted t-xs leading-relaxed">{version.detail}</span>
            </div>
          ))}
        </div>
        <p className="faint t-2xs leading-relaxed">
          Both versions are scanned. You do not need to know which one you used.
        </p>
      </Section>

      <Section title="V1 is being retired">
        <Retirement />
      </Section>

      <Section title="Questions">
        <div className="flex flex-col">
          {FACTS.map(([question, answer]) => (
            <div key={question} className="rule flex flex-col gap-1 border-b py-3.5 last:border-b-0">
              <span className="t-sm font-medium">{question}</span>
              <span className="muted t-xs">{answer}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="For developers">
        <Code>{`accounts        getProgramAccounts, two memcmp filters
                offset 0  MessageSent discriminator
                offset 8  your wallet

layout    v1    8 disc | 32 payer | 4 len | message
          v2    8 disc | 32 payer | 8 created_at | 4 len | message

programs  v1    CCTPmbSD7gX1bxKPAmg77w8oFzNFpaQiQUWD43TKaecd
          v2    CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC`}</Code>
        <Code>{`reclaim   v1    [disc][u32][attestation]
          v2    [disc][u32][attestation][u32][destination_message]

attest    v1    GET /v1/attestations/{keccak256(message)}
          v2    GET /v2/messages/5?transactionHash={sig}
          rate  35 req/s, throttled to ~8 here

limits          1232 bytes per tx
                v1 packs ~5, v2 packs 1 (376 byte message)
window          432,000s, error 6033 before that
fee payer       must keep 890,880 lamports rent exempt`}</Code>
        <p className="muted t-xs leading-relaxed">
          Anyone can reproduce the numbers on this page with one getProgramAccounts call. The source
          is on{" "}
          <a
            href={LINKS.github}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-4 hover:text-[var(--fg)]"
          >
            GitHub
          </a>
          .
        </p>
      </Section>

      <Section title="Not affiliated">
        <p className="muted t-xs leading-relaxed">
          An independent open-source tool, MIT licensed. Not affiliated with, endorsed by, or
          operated by Circle or Solana. USDC and CCTP are trademarks of Circle, used here only to
          describe what this tool works with. Attestations come from Circle’s public API under
          their developer terms. Use at your own risk.
        </p>
      </Section>
    </div>
  );
}
