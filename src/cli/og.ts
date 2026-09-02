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
const ACCENT = "#4a94e0";
const LINE = "rgba(255,255,255,0.08)";

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

function roundedRect(
  ctx: any,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmt(value: number): string {
  return value.toLocaleString("en-US");
}

export function renderOg(stats: Stats, price: number): Buffer {
  const font = ensureFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  const usd = Math.round((stats.lamports / 1e9) * price);
  const sol = stats.lamports / 1e9;

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Subtle top-left glow
  const glow = ctx.createRadialGradient(W * 0.24, -80, 40, W * 0.24, -80, 560);
  glow.addColorStop(0, "rgba(74,148,224,0.18)");
  glow.addColorStop(1, "rgba(74,148,224,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // Soft grid of faint dots for texture
  ctx.fillStyle = "rgba(255,255,255,0.035)";
  for (let x = 116; x < W; x += 76) {
    for (let y = 60; y < H; y += 76) {
      ctx.beginPath();
      ctx.arc(x, y, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Eyebrow
  ctx.fillStyle = FAINT;
  ctx.font = `500 19px ${font}`;
  ctx.letterSpacing = "5px";
  ctx.textBaseline = "alphabetic";
  ctx.fillText("UNCLAIMED ON SOLANA", 72, 96);
  ctx.letterSpacing = "0px";

  // Hero USD figure
  const hero = `$${fmt(usd)}`;
  ctx.fillStyle = FG;
  ctx.font = `600 150px ${font}`;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(hero, 72, 244);

  // Separator line + secondary
  ctx.strokeStyle = LINE;
  ctx.beginPath();
  ctx.moveTo(72, 300);
  ctx.lineTo(628, 300);
  ctx.stroke();

  ctx.fillStyle = MUTED;
  ctx.font = `500 30px ${font}`;
  ctx.fillText(`${sol.toFixed(2)} SOL across ${fmt(stats.accounts)} accounts`, 72, 352);

  // Descriptor
  ctx.fillStyle = FAINT;
  ctx.font = `400 22px ${font}`;
  ctx.fillText(
    "Every USDC bridge transfer rents a temporary account on Solana.",
    72,
    432
  );
  ctx.fillText(
    "The transfer completes, the rent stays locked until it is reclaimed.",
    72,
    464
  );

  // Accent pillar (brand mark), aligned to the wordmark row
  ctx.fillStyle = ACCENT;
  roundedRect(ctx, 72, H - 104, 14, 48, 7);
  ctx.fill();

  // Wordmark
  ctx.fillStyle = FG;
  ctx.font = `600 28px ${font}`;
  ctx.fillText("Reclaim", 106, H - 78);

  // Secondary line below the wordmark
  ctx.fillStyle = MUTED;
  ctx.font = `400 21px ${font}`;
  ctx.fillText(`${fmt(stats.accounts)} accounts · ${fmt(stats.wallets)} wallets`, 106, H - 48);

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
