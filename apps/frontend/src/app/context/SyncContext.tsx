"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { PropsWithChildren } from "react";
import { getToken } from "../../lib/auth";

type SyncContextValue = { lastSync: number };

const SyncContext = createContext<SyncContextValue>({ lastSync: 0 });

export const useSync = () => useContext(SyncContext);

export const SyncProvider = ({ children }: PropsWithChildren) => {
  const [lastSync, setLastSync] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;

    const connect = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch("/api/events", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || !res.body) return;
        reader = res.body.getReader();
        const decoder = new TextDecoder();
        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          const text = decoder.decode(value);
          if (text.includes("data: sync")) {
            setLastSync(Date.now());
          }
        }
      } catch {
        if (!cancelled) setTimeout(() => void connect(), 3000);
      }
    };

    void connect();

    return () => {
      cancelled = true;
      void reader?.cancel();
    };
  }, []);

  return <SyncContext.Provider value={{ lastSync }}>{children}</SyncContext.Provider>;
};
