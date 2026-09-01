import { useEffect, useState } from "react";
import NumberFlow, { continuous } from "@number-flow/react";
import { m, useReducedMotion } from "motion/react";

export const EASE = [0.16, 1, 0.3, 1] as const;
export const COLUMNS = "lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start lg:gap-20";
export const SPRING = { type: "spring", duration: 0.3, bounce: 0 } as const;

export function AnimatedNumber({ value, decimals = 4 }: { value: number; decimals?: number }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <NumberFlow
      value={ready ? value : 0}
      format={{ minimumFractionDigits: decimals, maximumFractionDigits: decimals }}
      plugins={[continuous]}
      spinTiming={{ duration: 900, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
      transformTiming={{ duration: 700, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
      opacityTiming={{ duration: 260, easing: "ease-out" }}
      willChange
    />
  );
}

export function Countdown({ target }: { target: number }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, target - Date.now()));

  useEffect(() => {
    const timer = setInterval(() => setRemaining(Math.max(0, target - Date.now())), 1000);
    return () => clearInterval(timer);
  }, [target]);

  const total = Math.floor(remaining / 1000);
  const parts = [
    { value: Math.floor(total / 86400), label: "days" },
    { value: Math.floor((total % 86400) / 3600), label: "hours" },
    { value: Math.floor((total % 3600) / 60), label: "min" },
    { value: total % 60, label: "sec" },
  ];

  return (
    <div className="flex items-start gap-6">
      {parts.map((part) => (
        <div key={part.label} className="flex flex-col gap-1.5">
          <span className="t-lg font-medium tabular-nums">
            <NumberFlow
              value={part.value}
              format={{ minimumIntegerDigits: 2 }}
              trend={-1}
              spinTiming={{ duration: 600, easing: "cubic-bezier(0.16, 1, 0.3, 1)" }}
            />
          </span>
          <span className="faint t-2xs">{part.label}</span>
        </div>
      ))}
    </div>
  );
}


export function Amount({
  dollars,
  sol,
  size = "display",
}: {
  dollars: number | null;
  sol: string;
  size?: "display" | "amount";
}) {
  const big = size === "display";

  return (
    <div className="flex flex-col gap-2">
      <span className={`display flex items-baseline ${big ? "t-display" : "t-amount"}`}>
        {dollars === null ? (
          <span className="faint">-</span>
        ) : (
          <>
            <span className={`muted mr-[3px] ${big ? "t-symbol" : "t-lg"}`}>$</span>
            <AnimatedNumber value={dollars} decimals={dollars >= 1000 ? 0 : 2} />
          </>
        )}
      </span>
      <span className="muted t-xs tabular-nums">{sol} SOL</span>
    </div>
  );
}


export function Checkbox({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="group flex cursor-pointer select-none items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="peer sr-only"
      />
      <span className="rule mt-px flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-colors duration-150 peer-checked:border-[var(--fg)] peer-checked:bg-[var(--fg)] peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent)]">
        <svg
          viewBox="0 0 12 12"
          fill="none"
          className="h-3 w-3 scale-75 text-[var(--bg)] opacity-0 transition duration-150"
          aria-hidden="true"
        >
          <path
            d="M2.5 6.2 4.8 8.5 9.5 3.8"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </span>
      <span className="flex flex-col gap-1">
        <span className="t-sm font-medium">{label}</span>
        {hint && <span className="muted t-xs leading-relaxed">{hint}</span>}
      </span>
    </label>
  );
}

export function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();

  return (
    <m.div
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}

export function Row({
  label,
  value,
  sub,
  live,
}: {
  label: string;
  value: string;
  sub?: string;
  live?: boolean;
}) {
  return (
    <div className="rule flex items-baseline justify-between border-b py-3.5 last:border-b-0">
      <span className="muted t-sm">{label}</span>
      <span className="flex items-baseline gap-2">
        {live && (
          <span className="self-center">
            <LiveDot />
          </span>
        )}
        <span className="t-sm font-medium tabular-nums">{value}</span>
        {sub && <span className="faint t-2xs tabular-nums">{sub}</span>}
      </span>
    </div>
  );
}

export function Skeleton({ className = "" }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <m.div
      animate={reduce ? { opacity: 0.5 } : { opacity: [0.35, 0.7, 0.35] }}
      transition={reduce ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
      className={`rounded-xl bg-[var(--line)] ${className}`}
    />
  );
}

export function Logo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M3.2 4.2v4.4h4.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Check() {
  const reduce = useReducedMotion();

  return (
    <svg width="34" height="34" viewBox="0 0 36 36" fill="none" aria-hidden>
      <circle cx="18" cy="18" r="16" stroke="currentColor" strokeWidth="2" opacity="0.25" />
      <m.path
        d="M11.5 18.5l4.4 4.3 9-9.4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.5, ease: EASE, delay: 0.1 }}
      />
    </svg>
  );
}

function Track({
  progress,
  thickness,
  duration,
}: {
  progress: number;
  thickness: string;
  duration: number;
}) {
  return (
    <div className={`w-full overflow-hidden rounded-full bg-[var(--line)] ${thickness}`}>
      <m.div
        className="h-full w-full origin-left rounded-full bg-[var(--accent)]"
        initial={{ scaleX: 0 }}
        animate={{ scaleX: Math.min(1, Math.max(0, progress)) }}
        transition={duration === 0 ? { duration: 0 } : { duration, ease: EASE }}
      />
    </div>
  );
}

export function Bar({ progress }: { progress: number }) {
  return <Track progress={progress} thickness="h-[2px]" duration={0.15} />;
}

export function Progress({ value }: { value: number }) {
  return <Track progress={value} thickness="h-[3px]" duration={0.8} />;
}

export function Button({
  children,
  onClick,
  disabled,
  describedBy,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={describedBy}
      className="rounded-lg bg-[var(--fg)] py-3 t-base font-medium text-[var(--bg)] transition-[opacity,scale] duration-150 ease-[cubic-bezier(0.2,0,0,1)] hover:opacity-90 active:scale-[0.96] disabled:pointer-events-none disabled:opacity-30"
    >
      {children}
    </button>
  );
}

export function LiveDot() {
  const reduce = useReducedMotion();

  return (
    <span className="relative flex h-1.5 w-1.5">
      {!reduce && (
        <m.span
          className="absolute inline-flex h-full w-full rounded-full bg-[var(--success)]"
          animate={{ scale: [1, 2.4, 1], opacity: [0.7, 0, 0.7] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--success)]" />
    </span>
  );
}

const MOON = <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />;
const SUN = (
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </>
);

export function ThemeToggle({ dark, onToggle }: { dark: boolean; onToggle: () => void }) {
  const reduce = useReducedMotion();

  const state = (active: boolean) =>
    reduce
      ? { opacity: active ? 1 : 0 }
      : {
          opacity: active ? 1 : 0,
          scale: active ? 1 : 0.25,
          filter: active ? "blur(0px)" : "blur(4px)",
        };

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className="muted relative h-[33px] w-[33px] rounded-full transition-colors duration-150 hover:bg-black/5 hover:text-[var(--fg)] dark:hover:bg-white/5"
    >
      {[true, false].map((moon) => (
        <m.svg
          key={moon ? "moon" : "sun"}
          className="absolute left-1/2 top-1/2 -ml-[8.5px] -mt-[8.5px]"
          initial={false}
          animate={state(moon === dark)}
          transition={reduce ? { duration: 0 } : SPRING}
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          aria-hidden
        >
          {moon ? MOON : SUN}
        </m.svg>
      ))}
    </button>
  );
}
