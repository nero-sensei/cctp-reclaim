import { readFileSync, writeFileSync } from "node:fs";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { Stats } from "../cctp/count";

/**
 * Renders a 1200x630 social-card image from the latest stats.
 * The updater runs this every time stats refresh so shared links
 * always show the current figure instead of a frozen snapshot.
 */

const W = 1200;
const H = 630;
const BG = "#0b0b0c";
const FG = "#f2f2f3";
const MUTED = "#93949a";
const FAINT = "#9a9ba1";

// Register a font that is present on both mac and the windows updater host.
function ensureFonts(): string {
  const candidates = [
    ["C:\\Windows\\Fonts\\segoeuib.ttf", "Segoe UI"],
    ["C:\\Windows\\Fonts\\arialbd.ttf", "Arial"],
    ["/System/Library/Fonts/Helvetica.ttc", "Helvetica"],
  ];

  for (const [path, name] of candidates) {
    try {
      GlobalFonts.registerFromPath(path, name);
    } catch {
      // ignore, we fall back to an already-registered system font below
    }
  }

  const families = GlobalFonts.families;
  const has = (re: RegExp) => families.some((f) => re.test(f.family));
  if (has(/segoe ui/i)) return "Segoe UI";
  if (has(/arial/i)) return "Arial";
  if (has(/inter/i)) return "Inter";
  return "sans-serif";
}

function fmt(value: number): string {
  return value.toLocaleString("en-US");
}

// The app renders the $ symbol muted and slightly smaller than the number,
// baseline-aligned with a small gap. Mirror that here.
function drawAmount(
  ctx: any,
  usd: number,
  x: number,
  baseline: number,
  font: string
): void {
  const value = fmt(usd);
  const symSize = 92;
  ctx.font = `600 ${symSize}px ${font}`;
  const symW = ctx.measureText("$").width;
  ctx.fillStyle = MUTED;
  ctx.fillText("$", x, baseline);

  ctx.font = `600 168px ${font}`;
  ctx.fillStyle = FG;
  ctx.fillText(value, x + symW + 6, baseline);
}

export function renderOg(stats: Stats, price: number): Buffer {
  const font = ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";

  const usd = Math.round((stats.lamports / 1e9) * price);
  const sol = stats.lamports / 1e9;

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Subtle top-left glow
  const glow = ctx.createRadialGradient(W * 0.22, -80, 40, W * 0.22, -80, 620);
  glow.addColorStop(0, "rgba(74,148,224,0.16)");
  glow.addColorStop(1, "rgba(74,148,224,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Eyebrow (10.5px in app -> ~34px on card)
  ctx.fillStyle = FAINT;
  ctx.font = `500 32px ${font}`;
  ctx.letterSpacing = "9px";
  ctx.fillText("UNCLAIMED ON SOLANA", 80, 118);
  ctx.letterSpacing = "0px";

  // Hero amount
  drawAmount(ctx, usd, 80, 308, font);

  // SOL line (muted, small)
  ctx.fillStyle = MUTED;
  ctx.font = `500 30px ${font}`;
  ctx.fillText(`${sol.toFixed(0)} SOL`, 82, 372);

  // Descriptor
  ctx.fillStyle = FAINT;
  ctx.font = `400 26px ${font}`;
  ctx.fillText(
    "Every USDC bridge transfer rents a temporary account on Solana.",
    80,
    470
  );
  ctx.fillText(
    "The transfer completes, the rent stays locked until it is reclaimed.",
    80,
    508
  );

  // Footer: wordmark + accounts line, pulled to the bottom edge
  const footY = H - 64;
  ctx.fillStyle = FG;
  ctx.font = `600 30px ${font}`;
  ctx.fillText("Reclaim", 80, footY);

  ctx.fillStyle = MUTED;
  ctx.font = `400 24px ${font}`;
  const accounts = `${fmt(stats.accounts)} accounts · ${fmt(stats.wallets)} wallets`;
  ctx.fillText(accounts, 80, footY + 34);

  return canvas.toBuffer("image/png");
}

async function fetchPrice(): Promise<number> {
  try {
    const res = await fetch(
      "https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112"
    );
    const data = await res.json();
    const value = data.So11111111111111111111111111111111111111112?.usdPrice;
    if (typeof value === "number" && value > 0) return value;
  } catch {
    // fall through to the safe default below
  }
  return 100;
}

export async function generateOg(stats: Stats, path: string): Promise<void> {
  const price = await fetchPrice();
  const image = renderOg(stats, price);
  writeFileSync(path, image);
  console.log(
    `wrote ${path} (${(image.length / 1024).toFixed(1)} KB) · $${fmt(
      Math.round((stats.lamports / 1e9) * price)
    )}`
  );
}

if (process.argv[1] && /og\.(ts|js)$/.test(process.argv[1])) {
  const stats: Stats = JSON.parse(readFileSync("public/stats.json", "utf8"));
  generateOg(stats, "public/og.png").catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
