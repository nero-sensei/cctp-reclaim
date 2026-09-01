import { useEffect, useState } from "react";

export interface Stats {
  generatedAt: string;
  accounts: number;
  lamports: number;
  wallets: number;
}

export function useStats(): Stats | null {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    let active = true;

    fetch("/stats.json")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => active && setStats(data))
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return stats;
}
