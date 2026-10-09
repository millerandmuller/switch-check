"use client";

import { useEffect, useState } from "react";
import { formatMs } from "@/lib/format";

// A running timer next to the thing it times, from a start moment taken with
// performance.now(). It ticks ten times a second and stops when `since` is
// null. The final figure of a stage or a cell is the server's measurement;
// this is only the wait made visible.
export function Elapsed({ since }: { since: number | null }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (since === null) return;
    const tick = () => setNow(performance.now());
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [since]);
  if (since === null || now === null) return null;
  return <span className="tabular-nums">{formatMs(Math.max(0, now - since))}</span>;
}
