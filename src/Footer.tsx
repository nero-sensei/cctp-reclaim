export const LINKS = {
  x: "https://x.com/nero__sensei",
  github: "https://github.com/nero-sensei/cctp-reclaim",
};

export default function Footer() {
  return (
    <footer className="rule faint flex items-center justify-between gap-4 border-t pt-5 t-2xs">
      <span>A public good. No fees, no custody.</span>
      <div className="flex items-center gap-4">
        <a href="#docs" className="-my-1.5 inline-flex min-w-[24px] justify-center px-2 py-1.5 hover:text-[var(--fg)]">
          Docs
        </a>
        <a href={LINKS.x} target="_blank" rel="noreferrer" className="-my-1.5 inline-flex min-w-[24px] justify-center px-2 py-1.5 hover:text-[var(--fg)]">
          X
        </a>
        <a href={LINKS.github} target="_blank" rel="noreferrer" className="-my-1.5 inline-flex min-w-[24px] justify-center px-2 py-1.5 hover:text-[var(--fg)]">
          GitHub
        </a>
      </div>
    </footer>
  );
}
