import { sol, usd } from "./format";
import { Row } from "./ui";
import { LiveStats } from "./useLiveStats";

export default function GlobalStats({
  stats,
  price,
}: {
  stats: LiveStats | null;
  price: number | null;
}) {
  const average = stats && stats.accounts > 0 ? stats.lamports / stats.accounts : null;

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
          label="Average per account"
          value={average !== null && price ? `$${usd((average / 1e9) * price)}` : "-"}
          sub={average !== null ? `${sol(average)} SOL` : undefined}
        />
      </div>
    </div>
  );
}
