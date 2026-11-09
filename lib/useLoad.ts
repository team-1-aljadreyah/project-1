"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLive } from "./live";

export type LoadState<T> =
  | { status: "loading" }
  | { status: "error"; error: unknown }
  | { status: "success"; data: T };

type Result<T> = { key: string; at: number } & ({ status: "error"; error: unknown } | { status: "success"; data: T });

export function useLoad<T>(fetcher: () => Promise<T>, key = "", options: { every?: number; keepPrevious?: boolean; live?: string[] } = {}) {
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  const [tick, setTick] = useState(0);
  const fullKey = `${key}#${tick}`;
  const [result, setResult] = useState<Result<T> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetcherRef.current().then(
      (data) => !cancelled && setResult({ key: fullKey, at: Date.now(), status: "success", data }),
      (error) => !cancelled && setResult({ key: fullKey, at: Date.now(), status: "error", error }),
    );
    return () => {
      cancelled = true;
    };
  }, [fullKey]);

  // Fetches again quietly: the old data stays on screen (no skeleton) until the new data arrives.
  const refresh = useCallback(() => {
    fetcherRef.current().then(
      (data) =>
        setResult((r) => (r && r.key === fullKey && r.status === "success" ? { key: fullKey, at: Date.now(), status: "success", data } : r)),
      () => {},
    );
  }, [fullKey]);

  const { every } = options;
  useEffect(() => {
    if (!every) return;
    const poll = () => !document.hidden && refresh();
    const timer = setInterval(poll, every);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [every, refresh]);

  // live: server events that make this data refresh at once (see lib/live.ts), e.g. ["visit.*"].
  useLive(options.live, refresh);

  // keepPrevious leaves the last list on screen while a new search loads, instead of the skeleton.
  const showOld = options.keepPrevious && result?.status === "success";
  const state: LoadState<T> = !result || (result.key !== fullKey && !showOld) ? { status: "loading" } : result;
  const updatedAt = result && result.key === fullKey ? result.at : null;

  const reload = useCallback(() => setTick((t) => t + 1), []);

  const setData = useCallback(
    (update: (data: T) => T) =>
      setResult((r) => (r && r.status === "success" ? { ...r, data: update(r.data) } : r)),
    [],
  );

  return { state, reload, refresh, setData, updatedAt };
}
