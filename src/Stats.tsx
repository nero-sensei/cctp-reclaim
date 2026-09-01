import { usd } from "./format";
import { Row } from "./ui";
import { LiveStats } from "./useLiveStats";

export default function GlobalStats({
  stats,
  price,
}: {
  stats: LiveStats | null;
  price: number | null;
}) {
  return (
    <div className="flex flex-col">
      <h2 className="eyebrow">Right now</h2>
      <div className="rule mt-4 flex flex-col border-t">
        <Row
          label="Open accounts"
          value={stats ? stats.accounts.toLocaleString() : "-"}
          live={stats?.live}
        />
        <Row label="Wallets holding them" value={stats ? stats.wallets.toLocaleString() : "-"} />
        <Row
          label="Rent per transfer"
          value={price ? `$${usd(0.0029 * price)} – $${usd(0.0039 * price)}` : "-"}
        />
      </div>
    </div>
  );
}
