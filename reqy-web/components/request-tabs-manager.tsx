"use client";

import { RequestPanel } from "@/components/request-panel";
import { ResponsePanel } from "@/components/response-panel";
import { CollectionsModal } from "@/components/collections-modal";
import { HistoryPanel } from "@/components/history-panel";
import { BatchRunProgress } from "@/components/batch-run-progress";
import { RequestTabBar } from "@/components/request-tab-bar";
import { RequestChainingDialog } from "@/components/request-chaining-dialog";
import { RequestSaveDialog } from "@/components/request-save-dialog";
import { RequestUnsavedCloseDialog } from "@/components/request-unsaved-close-dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable";
import { useRequestTabsState } from "@/hooks/use-request-tabs-state";
import { useRequestTabExecution } from "@/hooks/use-request-tab-execution";
import { useRequestStore, type RequestItem } from "@/hooks/use-request-store";
import { SimpleRequestBuilder } from "@/components/simple-mode/simple-request-builder";
import { persistence } from "@/lib/persistence";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/react/shallow";
import { getMethodPanelClass, recordToHeaderArray } from "@/lib/request-tab-utils";
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import type { RequestTab } from "@/lib/request-executor";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { saveRestSnapshot, compareRestSnapshot, getRestSnapshot } from "@/lib/rest-snapshot/store";
import type { FieldChange } from "@/lib/schema-diff";
import {
  proposeAssertionCorrection,
  suggestionToAssertion,
  type CorrectionSuggestion,
} from "@/lib/ai-engine/propose-correction";
import { SYSTEM_PROMPT } from "@/lib/ai-engine";
import type { TestResult } from "@/lib/types";
import { formatDataSize } from "@/lib/network/format";

/** Parse a response body string into JSON; returns undefined when not JSON. */
function parseResponseBody(body: string | undefined): unknown | undefined {
  if (body === undefined || body === null) return undefined;
  const trimmed = body.trim();
  if (trimmed === "") return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
}

/** Human-readable French description of a single schema change. */
function describeChange(c: FieldChange): string {
  switch (c.kind) {
    case "added":
      return `Champ '${c.path}' ajouté (${c.to})`;
    case "removed":
      return `Champ '${c.path}' retiré (${c.from})`;
    case "type-changed":
    case "type-changed:null":
      return `Champ '${c.path}' type changé : ${c.from} → ${c.to}`;
  }
}

export function RequestTabsManager() {
  const tabState = useRequestTabsState();
  const updateRequestById = useRequestStore((s) => s.updateRequestById);

  // "Mode simple" (Task 13): when enabled, hide the raw request editor and show
  // the natural-language guided builder instead. Persisted via the existing
  // persistence layer (the same store used by Settings).
  const [simpleMode, setSimpleMode] = useState(false);
  useEffect(() => {
    try {
      setSimpleMode(persistence.getItem<boolean>("reqly_simple_mode") === true);
    } catch {
      /* ignore */
    }
  }, []);
  const execution = useRequestTabExecution(tabState);

  const {
    tabs,
    activeTabId,
    setActiveTabId,
    activeTab,
    isLoading,
    savedIndicator,
    contextMenu,
    setContextMenu,
    collectionsDrawerOpen,
    setCollectionsDrawerOpen,
    historyOpen,
    setHistoryOpen,
    chainingOpen,
    setChainingOpen,
    generatingFollowUpId,
    pendingCloseTab,
    setPendingCloseTab,
    tabListRef,
    canScrollLeft,
    canScrollRight,
    scrollTabs,
    requestPanelRef,
    responsePanelRef,
    setIsRequestCollapsed,
    setIsResponseCollapsed,
    updateTab,
    addNewTab,
    forceCloseTab,
    closeTab,
    duplicateTab,
    closeOthers,
    closeToRight,
    closeAllTabs,
    saveAllTabs,
  } = tabState;

  const {
    aiEngine,
    collections,
    history,
    variableMappings,
    collectionRequestStatus,
    collectionRunLogs,
    batchRunCollection,
    setBatchRunCollection,
    saveActiveTab,
    handleSaveDialogSubmit,
    sendRequest,
    sendAndSave,
    sendAndDownload,
    loadRequestIntoActiveTab,
    loadAndSendRequest,
    runCollection,
    handleBatchRunRequest,
    handleAnalyzeRequest,
    handleGenerateTests,
    handleGenerateFollowUp,
    exportActiveRequest,
    createNewRequestInCollection,
    saveModalOpen,
    setSaveModalOpen,
    saveModalName,
    setSaveModalName,
    saveModalCollectionId,
    setSaveModalCollectionId,
  } = execution;

  // All of these are stable action references from the Zustand store. We pick
  // them with `useShallow` so this component only re-renders when one of the
  // picked references actually changes (never for state mutations, since the
  // actions themselves are stable).
  const {
    clearHistory,
    removeFromHistory,
    addCollection,
    updateCollection,
    deleteCollection,
    addRequestToCollection,
    removeRequestFromCollection,
    duplicateCollection,
    addFolder,
    renameFolder,
    deleteFolder,
    moveRequestToFolder,
    moveFolder,
    addVariableMapping,
    updateVariableMapping,
    removeVariableMapping,
  } = useRequestStore(
    useShallow((s) => ({
      clearHistory: s.clearHistory,
      removeFromHistory: s.removeFromHistory,
      addCollection: s.addCollection,
      updateCollection: s.updateCollection,
      deleteCollection: s.deleteCollection,
      addRequestToCollection: s.addRequestToCollection,
      removeRequestFromCollection: s.removeRequestFromCollection,
      duplicateCollection: s.duplicateCollection,
      addFolder: s.addFolder,
      renameFolder: s.renameFolder,
      deleteFolder: s.deleteFolder,
      moveRequestToFolder: s.moveRequestToFolder,
      moveFolder: s.moveFolder,
      addVariableMapping: s.addVariableMapping,
      updateVariableMapping: s.updateVariableMapping,
      removeVariableMapping: s.removeVariableMapping,
    })),
  );

  // ── AI-sidebar → tab sync bridge ─────────────────────────────────────────
  // When the AI sidebar (dispatchAIActions) updates store.currentRequest or
  // store.lastResponse, the editor's tab-based state does not see those
  // changes. These effects sync the store values back into the active tab
  // so the user sees the AI-filled request and response in the editor.
  //
  // JSON-stringify guards prevent re-syncing when the store value hasn't
  // actually changed (e.g. on tab switch or when the editor itself called
  // setCurrentRequest after its own tab update).

  const currentRequest = useRequestStore((s) => s.currentRequest);
  const lastResponse = useRequestStore((s) => s.lastResponse);
  const lastReqJson = useRef("");
  const lastRespJson = useRef("");

  // Real byte size of the request body, used to show "Taille : X Ko / Mo".
  const requestByteSize = useMemo(() => {
    const b = activeTab.body;
    return typeof b === "string" && b.length > 0 ? new Blob([b]).size : 0;
  }, [activeTab.body]);

  // REST contract-testing snapshots (Task 4) — kept localized to the response area.
  const [restDiff, setRestDiff] = useState<{ name: string; changes: FieldChange[] } | null>(null);

  const handleSaveSnapshot = () => {
    const name = window.prompt("Nom du snapshot :");
    if (!name || !name.trim()) return;
    const parsed = parseResponseBody(activeTab.responseBody);
    if (parsed === undefined) {
      toast({ title: "Réponse non-JSON", variant: "destructive" });
      return;
    }
    saveRestSnapshot(name.trim(), parsed);
    toast({ title: `Snapshot « ${name.trim()} » sauvegardé` });
    setRestDiff(null);
  };

  const handleCompareSnapshot = () => {
    const name = window.prompt("Nom du snapshot à comparer :");
    if (!name || !name.trim()) return;
    if (!getRestSnapshot(name.trim())) {
      toast({ title: `Snapshot « ${name.trim()} » introuvable`, variant: "destructive" });
      return;
    }
    const parsed = parseResponseBody(activeTab.responseBody);
    if (parsed === undefined) {
      toast({ title: "Réponse non-JSON", variant: "destructive" });
      return;
    }
    setRestDiff({ name: name.trim(), changes: compareRestSnapshot(name.trim(), parsed) });
  };

  // ── AI "Proposer une correction" on a failed assertion (Task 5) ───────────
  // The AI is only ever asked to *suggest* a corrected assertion. Applying it
  // requires an explicit user click ("Appliquer") — we never auto-apply, which
  // respects the existing store.aiAutoApply default-off guard. The askAI fn
  // reuses the real engine's text completion (callAIText under the hood).
  const correctionAskAI = useCallback(
    async (prompt: string) => {
      const ctx = aiEngine.buildContext();
      return aiEngine.sendMessage(prompt, SYSTEM_PROMPT, ctx);
    },
    [aiEngine],
  );

  const handleApplyCorrection = useCallback(
    (result: TestResult, suggestion: CorrectionSuggestion) => {
      const match = /-(\d+)$/.exec(result.assertionId);
      const index = match ? Number(match[1]) : -1;
      const assertions = activeTab.runnerAssertions ?? [];
      const original = assertions[index];
      if (index < 0 || !original) {
        toast({ title: "Assertion introuvable", variant: "destructive" });
        return;
      }
      const corrected = suggestionToAssertion(suggestion, original);
      updateTab(activeTab.id, {
        runnerAssertions: assertions.map((a, i) => (i === index ? corrected : a)),
      } as Parameters<typeof updateTab>[1]);
      toast({ title: "Assertion corrigée" });
    },
    [activeTab, updateTab],
  );

  useEffect(() => {
    if (!currentRequest) return;
    const json = JSON.stringify({
      m: currentRequest.method,
      u: currentRequest.url,
      h: currentRequest.headers,
      p: currentRequest.params,
      b: currentRequest.body,
    });
    if (json === lastReqJson.current) return;
    lastReqJson.current = json;

    const patch: Partial<RequestTab> = {};
    if (currentRequest.method) {
      patch.method = currentRequest.method as import("@/lib/request-executor").HttpMethod;
    }
    if (currentRequest.url !== undefined) {
      patch.url = currentRequest.url;
      patch.endpoint = currentRequest.url.replace(/^https?:\/\/[^/]+/, "") || "/";
    }
    if (currentRequest.headers) {
      patch.headers = recordToHeaderArray(currentRequest.headers);
    }
    if (currentRequest.params) {
      patch.queryParams = Object.entries(currentRequest.params).map(([key, value]) => ({
        key,
        value: String(value),
        enabled: true,
      }));
    }
    if (currentRequest.body !== undefined) {
      patch.body =
        typeof currentRequest.body === "string"
          ? currentRequest.body
          : JSON.stringify(currentRequest.body);
    }
    if (Object.keys(patch).length > 0) {
      updateTab(activeTab.id, patch);
    }
  }, [currentRequest, activeTab.id, updateTab]);

  useEffect(() => {
    if (!lastResponse) return;
    const json = JSON.stringify({
      s: lastResponse.status,
      d: lastResponse.durationMs,
      h: lastResponse.headers,
    });
    if (json === lastRespJson.current) return;
    lastRespJson.current = json;

    updateTab(activeTab.id, {
      hasResponse: true,
      responseStatus: lastResponse.status,
      responseTime: lastResponse.durationMs,
      responseHeaders: lastResponse.headers,
      responseCookies: lastResponse.cookies,
      responseBody: lastResponse.body as string | undefined,
    });
  }, [lastResponse, activeTab.id, updateTab]);

  // Rename a request: keep the tab label in sync and persist to the saved
  // request in the collection when the tab is backed by one.
  const renameTab = useCallback(
    (tabId: string, name: string) => {
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const finalName = name.trim() || tab.name;
      updateTab(tabId, { name: finalName });
      if (tab.savedRequestId) updateRequestById(tab.savedRequestId, { name: finalName });
    },
    [tabs, updateTab, updateRequestById],
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div data-testid="request-tabs">
        <RequestTabBar
          tabs={tabs}
          activeTabId={activeTabId}
          canScrollLeft={canScrollLeft}
          canScrollRight={canScrollRight}
          tabListRef={tabListRef}
          contextMenu={contextMenu}
          onSelectTab={setActiveTabId}
          onScroll={scrollTabs}
          onAddTab={addNewTab}
          onCloseTab={closeTab}
          onContextMenu={setContextMenu}
          onCloseContextMenu={() => setContextMenu(null)}
          onSaveActiveTab={saveActiveTab}
          onDuplicateTab={duplicateTab}
          onCloseOthers={closeOthers}
          onCloseToRight={closeToRight}
          onCloseAllTabs={closeAllTabs}
          onSaveAllTabs={saveAllTabs}
          onOpenCollections={() => setCollectionsDrawerOpen(true)}
          onDuplicateActive={() => duplicateTab(activeTab)}
          onSaveActive={saveActiveTab}
          onOpenHistory={() => setHistoryOpen(true)}
          onRenameTab={renameTab}
        />
      </div>

      {collectionRunLogs.length > 0 && (
        <div className="border-b border-border/50 bg-muted/5 px-4 py-2">
          <div className="rounded-lg border border-border/30 bg-muted/10 px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">
                Run Logs
              </span>
            </div>
            <div className="space-y-0.5 max-h-[80px] overflow-y-auto scrollbar-discreet">
              {collectionRunLogs.slice(-5).map((log) => (
                <div
                  key={`log-${log}`}
                  className="text-[11px] font-mono text-muted-foreground/70 truncate"
                >
                  <span className="text-muted-foreground/30">{`>`}</span> {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {simpleMode ? (
        <div className="min-h-0 h-full flex-1 overflow-hidden">
          <SimpleRequestBuilder />
        </div>
      ) : (
        <div
          className={cn(
            "min-h-0 h-full flex-1 overflow-hidden transition-colors duration-200",
            getMethodPanelClass(activeTab.method),
          )}
        >
          <ResizablePanelGroup direction="horizontal" className="min-h-0 h-full">
            <ResizablePanel
              ref={requestPanelRef}
              order={1}
              defaultSize={55}
              minSize={25}
              collapsedSize={0}
              collapsible
              onCollapse={() => setIsRequestCollapsed(true)}
              onExpand={() => setIsRequestCollapsed(false)}
              className="min-w-0 min-h-0 overflow-hidden"
            >
              <div className="min-h-0 h-full overflow-auto hide-scrollbar border-r border-border max-[916px]:border-r-0 max-[916px]:border-b request-panel-scroll">
                <RequestPanel
                  key={activeTab.id}
                  method={activeTab.method}
                  url={activeTab.url}
                  queryParams={activeTab.queryParams}
                  headers={activeTab.headers}
                  body={activeTab.body}
                  bodyType={activeTab.bodyType}
                  authType={activeTab.authType}
                  authToken={activeTab.authToken}
                  assertions={activeTab.assertions}
                  runnerAssertions={activeTab.runnerAssertions}
                  preRequestScript={activeTab.preRequestScript}
                  postResponseScript={activeTab.postResponseScript}
                  onMethodChange={(method) => updateTab(activeTab.id, { method })}
                  onUrlChange={(url) => {
                    const endpoint = url.replace(/^https?:\/\/[^/]+/, "") || "/";
                    updateTab(activeTab.id, { url, endpoint });
                  }}
                  onQueryParamsChange={(queryParams) => updateTab(activeTab.id, { queryParams })}
                  onHeadersChange={(headers) => updateTab(activeTab.id, { headers })}
                  onBodyChange={(body) => updateTab(activeTab.id, { body })}
                  onBodyTypeChange={(bodyType) => updateTab(activeTab.id, { bodyType })}
                  onAuthChange={(authType, authToken) =>
                    updateTab(activeTab.id, { authType, authToken })
                  }
                  onAssertionsChange={(assertions) => updateTab(activeTab.id, { assertions })}
                  onRunnerAssertionsChange={(runnerAssertions) =>
                    updateTab(activeTab.id, { runnerAssertions })
                  }
                  onPreRequestScriptChange={(preRequestScript) =>
                    updateTab(activeTab.id, { preRequestScript })
                  }
                  onPostResponseScriptChange={(postResponseScript) =>
                    updateTab(activeTab.id, { postResponseScript })
                  }
                  onRunTests={sendRequest}
                  onSend={sendRequest}
                  isLoading={isLoading}
                  variableNames={variableMappings
                    .filter((m) => m.enabled && m.name.trim())
                    .map((m) => m.name.trim())}
                />
                {/* Payload size — real byte count of the request body */}
                {requestByteSize > 0 && (
                  <div
                    className="px-4 py-1 text-[11px] font-mono text-muted-foreground border-t border-border/50 bg-card/40"
                    data-testid="request-size"
                  >
                    Taille : {formatDataSize(requestByteSize)}
                  </div>
                )}
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle className="bg-border" />

            <ResizablePanel
              ref={responsePanelRef}
              order={2}
              defaultSize={45}
              minSize={25}
              collapsedSize={0}
              collapsible
              onCollapse={() => setIsResponseCollapsed(true)}
              onExpand={() => setIsResponseCollapsed(false)}
              className="min-w-0 min-h-0 overflow-hidden"
            >
              <div className="min-h-0 h-full overflow-auto flex-1 hide-scrollbar">
                <ResponsePanel
                  key={activeTab.id}
                  responseBody={activeTab.responseBody}
                  responseData={activeTab.responseData}
                  responseStatus={activeTab.responseStatus}
                  responseTime={activeTab.responseTime}
                  responseTimings={activeTab.responseTimings}
                  responseSize={activeTab.responseSize}
                  responseHeaders={activeTab.responseHeaders}
                  responseCookies={activeTab.responseCookies}
                  testResults={activeTab.testResults}
                  isLoading={isLoading || aiEngine.isLoading}
                  aiIsLoading={aiEngine.isLoading}
                  onRun={sendRequest}
                  onRunAndSave={sendAndSave}
                  onRunAndDownload={sendAndDownload}
                  onAnalyze={handleAnalyzeRequest}
                  onGenerateTests={handleGenerateTests}
                  onPatchRequest={(patch) => {
                    const tabPatch: Record<string, unknown> = {};
                    if (patch.method !== undefined) tabPatch.method = patch.method;
                    if (patch.url !== undefined) {
                      tabPatch.url = patch.url;
                      tabPatch.endpoint = patch.url.replace(/^https?:\/\/[^/]+/, "") || "/";
                    }
                    if (patch.headers !== undefined) {
                      tabPatch.headers = Object.entries(patch.headers).map(([key, value]) => ({
                        key,
                        value,
                      }));
                    }
                    if (patch.body !== undefined)
                      tabPatch.body =
                        typeof patch.body === "string" ? patch.body : JSON.stringify(patch.body);
                    if (patch.authType !== undefined) tabPatch.authType = patch.authType;
                    updateTab(activeTab.id, tabPatch as Parameters<typeof updateTab>[1]);
                  }}
                  aiSummary={aiEngine.lastSummary ?? undefined}
                  aiError={aiEngine.error ?? undefined}
                  proposeAskAI={correctionAskAI}
                  onApplyCorrection={handleApplyCorrection}
                  method={activeTab.method}
                  url={activeTab.url}
                  queryParams={activeTab.queryParams}
                  requestHeaders={activeTab.headers}
                  body={activeTab.body}
                  bodyType={activeTab.bodyType}
                  authType={activeTab.authType}
                  authToken={activeTab.authToken}
                  history={history}
                />

                {/* Snapshots REST (contract testing) — localized to the response area */}
                <div
                  className="border-t border-border/50 bg-card/40 p-2 space-y-2"
                  data-testid="rest-snapshot-controls"
                >
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={handleSaveSnapshot}
                      disabled={!activeTab.responseBody}
                      data-testid="rest-snapshot-save"
                    >
                      Sauvegarder un snapshot
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={handleCompareSnapshot}
                      disabled={!activeTab.responseBody}
                      data-testid="rest-snapshot-compare"
                    >
                      Comparer à un snapshot
                    </Button>
                    {restDiff && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => setRestDiff(null)}
                        data-testid="rest-snapshot-clear"
                      >
                        Fermer
                      </Button>
                    )}
                  </div>

                  {restDiff && (
                    <div
                      className="text-xs font-mono bg-muted/30 p-2 rounded space-y-1 max-h-64 overflow-auto"
                      data-testid="rest-snapshot-diff"
                    >
                      <div className="text-muted-foreground">
                        Comparaison avec « {restDiff.name} »
                      </div>
                      {restDiff.changes.length === 0 ? (
                        <div className="text-success">✅ Aucun changement détecté.</div>
                      ) : (
                        restDiff.changes.map((c, i) => (
                          <div
                            key={`${c.path}-${i}`}
                            className={c.kind === "removed" ? "text-destructive" : "text-warning"}
                          >
                            {describeChange(c)}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      )}

      <CollectionsModal
        open={collectionsDrawerOpen}
        onOpenChange={setCollectionsDrawerOpen}
        collections={collections}
        onSelectRequest={loadRequestIntoActiveTab}
        onSelectAndSendRequest={loadAndSendRequest}
        onRunCollection={runCollection}
        onAddCollection={(data) =>
          addCollection({
            name: data?.name || "New Collection",
            color: data?.color || "emerald",
            icon: data?.icon || "package",
          })
        }
        onDeleteCollection={deleteCollection}
        onRenameCollection={(id, name) => updateCollection(id, { name })}
        onAddRequestToCollection={(
          collectionId,
          request?: Omit<RequestItem, "id" | "createdAt" | "updatedAt">,
        ) => {
          if (request) {
            addRequestToCollection(collectionId, request);
            return;
          }
          createNewRequestInCollection(collectionId);
        }}
        onRemoveRequestFromCollection={removeRequestFromCollection}
        onDuplicateCollection={duplicateCollection}
        onAddFolder={addFolder}
        onRenameFolder={renameFolder}
        onDeleteFolder={deleteFolder}
        onMoveRequestToFolder={moveRequestToFolder}
        onMoveFolder={moveFolder}
      />

      <RequestChainingDialog
        open={chainingOpen}
        onOpenChange={setChainingOpen}
        history={history}
        variableMappings={variableMappings}
        onAddMapping={() =>
          addVariableMapping({
            name: "",
            sourceRequestId: history[0]?.id ?? "",
            sourcePath: "",
            enabled: true,
          })
        }
        onUpdateMapping={updateVariableMapping}
        onRemoveMapping={removeVariableMapping}
      />

      <Drawer open={historyOpen} onOpenChange={setHistoryOpen} direction="right">
        <DrawerContent className="max-w-xl p-0">
          <DrawerHeader>
            <DrawerTitle>Request History</DrawerTitle>
          </DrawerHeader>
          <div className="h-[80vh] overflow-hidden">
            <HistoryPanel
              history={history}
              onSelectRequest={(item) => {
                loadRequestIntoActiveTab(item);
                setHistoryOpen(false);
              }}
              onClearHistory={clearHistory}
              onRemoveItem={removeFromHistory}
              onGenerateFollowUp={handleGenerateFollowUp}
              generatingFollowUpId={generatingFollowUpId}
            />
          </div>
        </DrawerContent>
      </Drawer>

      <RequestSaveDialog
        open={saveModalOpen}
        onOpenChange={setSaveModalOpen}
        name={saveModalName}
        onNameChange={setSaveModalName}
        collectionId={saveModalCollectionId}
        onCollectionIdChange={setSaveModalCollectionId}
        collections={collections}
        onSubmit={handleSaveDialogSubmit}
      />

      <RequestUnsavedCloseDialog
        pendingTab={pendingCloseTab}
        onOpenChange={(open) => !open && setPendingCloseTab(null)}
        onDiscard={() => {
          if (pendingCloseTab) forceCloseTab(pendingCloseTab.id);
          setPendingCloseTab(null);
        }}
      />

      {batchRunCollection && (
        <BatchRunProgress
          collection={batchRunCollection}
          isOpen
          onClose={() => setBatchRunCollection(null)}
          onRunRequest={handleBatchRunRequest}
        />
      )}
    </div>
  );
}
