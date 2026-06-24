"use client";

import { useState, useCallback, useRef } from "react";
import type { GraphqlTab, GraphQLExecuteResult } from "@/lib/types";
import { executeGraphQL } from "@/lib/graphql/execute";
import { subscribeGraphQL } from "@/lib/graphql/subscribe";
import { introspectSchema } from "@/lib/graphql/introspect";
import { formatGraphQL } from "@/lib/graphql/format";

const DEFAULT_ENDPOINT = "https://countries.trevorblades.com/";
const DEFAULT_QUERY = `query GetExample {\n  __typename\n}`;

function makeId() {
  return `gql-tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useGraphqlTabsState() {
  const [tabs, setTabs] = useState<GraphqlTab[]>([
    {
      id: makeId(),
      name: "Untitled GraphQL",
      endpoint: DEFAULT_ENDPOINT,
      query: DEFAULT_QUERY,
      variables: "{}",
      headers: "{}",
    },
  ]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];
  const subscriptionRef = useRef<{ close: () => void } | null>(null);
  const messageCounter = useRef(0);

  const updateTab = useCallback(
    (id: string, patch: Partial<GraphqlTab>) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === id ? { ...t, ...patch, dirty: true } : t)),
      );
    },
    [],
  );

  const addNewTab = useCallback(() => {
    const newTab: GraphqlTab = {
      id: makeId(),
      name: "Untitled GraphQL",
      endpoint: DEFAULT_ENDPOINT,
      query: DEFAULT_QUERY,
      variables: "{}",
      headers: "{}",
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      if (tabs.length <= 1) return;
      setTabs((prev) => prev.filter((t) => t.id !== id));
      if (activeTabId === id) {
        const remaining = tabs.filter((t) => t.id !== id);
        setActiveTabId(remaining[0]?.id ?? "");
      }
    },
    [tabs, activeTabId],
  );

  const duplicateTab = useCallback(
    (id: string) => {
      const source = tabs.find((t) => t.id === id);
      if (!source) return;
      const copy: GraphqlTab = {
        ...source,
        id: makeId(),
        name: `${source.name} Copy`,
        saved: false,
        dirty: true,
      };
      setTabs((prev) => [...prev, copy]);
      setActiveTabId(copy.id);
    },
    [tabs],
  );

  const runQuery = useCallback(async () => {
    const tab = activeTab;
    if (!tab.endpoint || !tab.query.trim()) return;

    let parsedVars: Record<string, unknown> = {};
    let parsedHeaders: Record<string, string> = {};
    try {
      if (tab.variables.trim() && tab.variables.trim() !== "{}") {
        parsedVars = JSON.parse(tab.variables);
      }
      if (tab.headers.trim() && tab.headers.trim() !== "{}") {
        parsedHeaders = JSON.parse(tab.headers);
      }
    } catch {
      updateTab(tab.id, { response: undefined });
      return;
    }

    const isSubscription = /\bsubscription\b/.test(tab.query);

    if (isSubscription) {
      messageCounter.current = 0;
      updateTab(tab.id, {
        subscriptionMessages: [],
        schemaLoading: false,
      });
      const handle = subscribeGraphQL(
        tab.endpoint,
        tab.query,
        parsedVars,
        parsedHeaders,
        (msg) => {
          messageCounter.current += 1;
          const messageView = {
            id: messageCounter.current,
            type: msg.type as "data" | "error" | "complete" | "info",
            payload: msg.payload,
            timestamp: Date.now(),
          };
          setTabs((prev) =>
            prev.map((t) =>
              t.id === tab.id
                ? {
                    ...t,
                    subscriptionMessages: [
                      ...(t.subscriptionMessages ?? []),
                      messageView,
                    ],
                    dirty: true,
                  }
                : t,
            ),
          );
        },
      );
      subscriptionRef.current = handle;
      return;
    }

    updateTab(tab.id, { schemaLoading: true, response: undefined });
    const started = Date.now();
    try {
      const result = await executeGraphQL({
        endpoint: tab.endpoint,
        query: tab.query,
        variables: parsedVars,
        headers: parsedHeaders,
      });
      updateTab(tab.id, {
        response: result,
        schemaLoading: false,
      });
    } catch (e) {
      updateTab(tab.id, {
        response: {
          statusCode: 0,
          responseTimeMs: Date.now() - started,
          headers: {},
          graphqlBody: {},
          errors: [
            { message: e instanceof Error ? e.message : "Network error" },
          ],
        } as GraphQLExecuteResult,
        schemaLoading: false,
      });
    }
  }, [activeTab, updateTab]);

  const stopSubscription = useCallback(() => {
    if (subscriptionRef.current) {
      subscriptionRef.current.close();
      subscriptionRef.current = null;
    }
  }, []);

  const introspect = useCallback(async () => {
    const tab = activeTab;
    if (!tab.endpoint) return;
    updateTab(tab.id, { schemaLoading: true });
    try {
      const sdl = await introspectSchema(tab.endpoint);
      const parsed = JSON.parse(sdl) as { __schema?: unknown };
      updateTab(tab.id, {
        schema: parsed.__schema ?? null,
        schemaLoading: false,
      });
    } catch (e) {
      updateTab(tab.id, { schemaLoading: false });
    }
  }, [activeTab, updateTab]);

  const prettify = useCallback(() => {
    updateTab(activeTab.id, { query: formatGraphQL(activeTab.query) });
  }, [activeTab, updateTab]);

  return {
    tabs,
    activeTabId,
    activeTab,
    setActiveTabId,
    updateTab,
    addNewTab,
    closeTab,
    duplicateTab,
    runQuery,
    stopSubscription,
    introspect,
    prettify,
  };
}

export type GraphqlTabsState = ReturnType<typeof useGraphqlTabsState>;
