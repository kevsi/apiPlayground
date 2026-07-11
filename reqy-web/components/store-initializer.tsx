"use client";

import { useEffect } from "react";
import { requestStore } from "@/hooks/use-request-store";
import { persistence } from "@/lib/persistence";

export function StoreInitializer() {
  useEffect(() => {
    // Wait for the persistence layer to finish loading from IndexedDB (with
    // a localStorage migration if needed) BEFORE initialising the store.
    //
    // Without this await there is a race window where `initStore` reads
    // `persistence.getItem` synchronously from the in-memory cache. The
    // cache is populated eagerly from localStorage in the `Persistence`
    // constructor, but `init()` will then asynchronously overwrite those
    // entries with the authoritative IndexedDB values (or migrate from
    // localStorage). If `initStore` runs in the gap, the store ends up
    // using stale localStorage data that will be silently replaced a few
    // ms later, causing flash + potential data loss in the first render.
    let cancelled = false;
    void (async () => {
      try {
        await persistence.waitForReady();
      } catch (err) {
        console.warn("[StoreInitializer] persistence wait failed:", err);
      }
      if (cancelled) return;
      const state = requestStore.getState();
      if (state.isLoaded) return;
      try {
        await state.initStore();
      } catch (err) {
        console.warn("[StoreInitializer] initStore failed:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
