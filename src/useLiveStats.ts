import { useEffect, useState } from "react";
import { useConnection } from "@solana/wallet-adapter-react";
import { PROGRAMS } from "./cctp";
import { Stats, useStats } from "./useStats";

export interface LiveStats extends Stats {
  created: number;
  reclaimed: number;
  live: boolean;
}

export function useLiveStats(): LiveStats | null {
  const { connection } = useConnection();
  const snapshot = useStats();
  const [created, setCreated] = useState(0);
  const [reclaimed, setReclaimed] = useState(0);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const ids = [PROGRAMS.v1.program, PROGRAMS.v2.program];

    const subscriptions = ids.map((programId) =>
      connection.onLogs(
        programId,
        ({ err, logs }) => {
          if (err) return;
          setLive(true);

          const text = logs.join("\n");
          if (text.includes("ReclaimEventAccount")) setReclaimed((n) => n + 1);
          else if (text.includes("SendMessage")) setCreated((n) => n + 1);
        },
        "confirmed"
      )
    );

    return () => {
      subscriptions.forEach((id) => {
        connection.removeOnLogsListener(id).catch(() => undefined);
      });
    };
  }, [connection]);

  if (!snapshot || snapshot.accounts <= 0) return snapshot && { ...snapshot, created, reclaimed, live };

  const accounts = Math.max(0, snapshot.accounts + created - reclaimed);
  const average = snapshot.lamports / snapshot.accounts;

  return {
    ...snapshot,
    accounts,
    lamports: Math.round(accounts * average),
    created,
    reclaimed,
    live,
  };
}
