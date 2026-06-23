"use client"

import { RequestPanel } from "@/components/request-panel"
import { ResponsePanel } from "@/components/response-panel"
import { CollectionsModal } from "@/components/collections-modal"
import { HistoryPanel } from "@/components/history-panel"
import { BatchRunProgress } from "@/components/batch-run-progress"
import { RequestTabBar } from "@/components/request-tab-bar"
import { RequestActiveToolbar } from "@/components/request-active-toolbar"
import { RequestChainingDialog } from "@/components/request-chaining-dialog"
import { RequestSaveDialog } from "@/components/request-save-dialog"
import { RequestUnsavedCloseDialog } from "@/components/request-unsaved-close-dialog"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "@/components/ui/resizable"
import { useRequestTabsState } from "@/hooks/use-request-tabs-state"
import { useRequestTabExecution } from "@/hooks/use-request-tab-execution"
import { useRequestStore, type RequestItem } from "@/hooks/use-request-store"
import { cn } from "@/lib/utils"
import { getMethodPanelClass } from "@/lib/request-tab-utils"

export function RequestTabsManager() {
  const tabState = useRequestTabsState()
  const execution = useRequestTabExecution(tabState)

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
  } = tabState

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
    handleCreateMock,
    handleGenerateFollowUp,
    exportActiveRequest,
    createNewRequestInCollection,
    saveModalOpen,
    setSaveModalOpen,
    saveModalName,
    setSaveModalName,
    saveModalCollectionId,
    setSaveModalCollectionId,
  } = execution

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
  } = useRequestStore()

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
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
      />

      <RequestActiveToolbar
        activeTab={activeTab}
        savedIndicator={savedIndicator}
        collectionRequestStatus={collectionRequestStatus}
        onNameChange={(name) => updateTab(activeTab.id, { name })}
        onOpenCollections={() => setCollectionsDrawerOpen(true)}
        onDuplicateTab={() => duplicateTab(activeTab)}
        onSave={saveActiveTab}
        onOpenHistory={() => setHistoryOpen(true)}
        onExport={exportActiveRequest}
        onOpenChaining={() => setChainingOpen(true)}
      />

      {collectionRunLogs.length > 0 && (
        <div className="border-b border-border/50 bg-muted/5 px-4 py-2">
          <div className="rounded-lg border border-border/30 bg-muted/10 px-3 py-2">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/50">Run Logs</span>
            </div>
            <div className="space-y-0.5 max-h-[80px] overflow-y-auto scrollbar-discreet">
              {collectionRunLogs.slice(-5).map((log) => (
                <div key={`log-${log}`} className="text-[11px] font-mono text-muted-foreground/70 truncate">
                  <span className="text-muted-foreground/30">{`>`}</span> {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className={cn("min-h-0 h-full flex-1 overflow-hidden transition-colors duration-200", getMethodPanelClass(activeTab.method))}>
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
                protocol={activeTab.protocol}
                graphql={activeTab.graphql}
                runnerAssertions={activeTab.runnerAssertions}
                preRequestScript={activeTab.preRequestScript}
                postResponseScript={activeTab.postResponseScript}
                onMethodChange={(method) => updateTab(activeTab.id, { method })}
                onUrlChange={(url) => {
                  const endpoint = url.replace(/^https?:\/\/[^/]+/, "") || "/"
                  updateTab(activeTab.id, { url, endpoint })
                }}
                onQueryParamsChange={(queryParams) => updateTab(activeTab.id, { queryParams })}
                onHeadersChange={(headers) => updateTab(activeTab.id, { headers })}
                onBodyChange={(body) => updateTab(activeTab.id, { body })}
                onBodyTypeChange={(bodyType) => updateTab(activeTab.id, { bodyType })}
                onAuthChange={(authType, authToken) => updateTab(activeTab.id, { authType, authToken })}
                onAssertionsChange={(assertions) => updateTab(activeTab.id, { assertions })}
                onProtocolChange={(protocol) => updateTab(activeTab.id, { protocol })}
                onGraphqlChange={(graphql) => updateTab(activeTab.id, { graphql })}
                onRunnerAssertionsChange={(runnerAssertions) => updateTab(activeTab.id, { runnerAssertions })}
                onPreRequestScriptChange={(preRequestScript) => updateTab(activeTab.id, { preRequestScript })}
                onPostResponseScriptChange={(postResponseScript) => updateTab(activeTab.id, { postResponseScript })}
                onRunTests={sendRequest}
                onSend={sendRequest}
                isLoading={isLoading}
                variableNames={variableMappings.filter((m) => m.enabled && m.name.trim()).map((m) => m.name.trim())}
              />
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
                responseSize={activeTab.responseSize}
                responseHeaders={activeTab.responseHeaders}
                mocked={activeTab.mocked}
                testResults={activeTab.testResults}
                isLoading={isLoading || aiEngine.isLoading}
                aiIsLoading={aiEngine.isLoading}
                onRun={sendRequest}
                onRunAndSave={sendAndSave}
                onRunAndDownload={sendAndDownload}
                onAnalyze={handleAnalyzeRequest}
                onGenerateTests={handleGenerateTests}
                onCreateMock={handleCreateMock}
                aiSummary={aiEngine.lastSummary ?? undefined}
                aiError={aiEngine.error ?? undefined}
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
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

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
        onAddRequestToCollection={(collectionId, request?: Omit<RequestItem, "id" | "createdAt" | "updatedAt">) => {
          if (request) {
            addRequestToCollection(collectionId, request)
            return
          }
          createNewRequestInCollection(collectionId)
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
                loadRequestIntoActiveTab(item)
                setHistoryOpen(false)
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
          if (pendingCloseTab) forceCloseTab(pendingCloseTab.id)
          setPendingCloseTab(null)
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
  )
}
