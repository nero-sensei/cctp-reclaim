import { useEffect, useState } from "react";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const ENDPOINT = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`;

export function usePrice(): number | null {
  const [price, setPrice] = useState<number | null>(null);

  useEffect(() => {
    let active = true;

    const load = () =>
      fetch(ENDPOINT)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (active && data?.[SOL_MINT]?.usdPrice) setPrice(data[SOL_MINT].usdPrice);
        })
        .catch(() => undefined);

    load();
    const timer = setInterval(load, 60_000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);

  return price;
}
