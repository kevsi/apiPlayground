"use client"

import { useState } from "react"
import { GitBranch, GitCommit, GitCommitHorizontal, Loader2, Plus, FileText, AlertCircle, Diff, CheckCircle2, Circle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { useGit, type GitCommit as GitCommitType, type FileStatus, type DiffEntry } from "@/hooks/use-git"
import type { Collection } from "@/hooks/use-request-store"

interface GitPanelProps {
  collections: Collection[]
}

export function GitPanel({ collections }: GitPanelProps) {
  const git = useGit(collections)
  const [commitMessage, setCommitMessage] = useState("")
  const [commitDialogOpen, setCommitDialogOpen] = useState(false)
  const [diffOids, setDiffOids] = useState<[string, string] | null>(null)
  const [diffResult, setDiffResult] = useState<DiffEntry[] | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)

  const handleCommit = async () => {
    if (!commitMessage.trim()) return
    await git.commit(commitMessage.trim())
    setCommitMessage("")
    setCommitDialogOpen(false)
  }

  const handleDiff = async (oidA: string, oidB: string) => {
    setDiffLoading(true)
    setDiffOids([oidA, oidB])
    try {
      const result = await git.diff(oidA, oidB)
      setDiffResult(result)
    } catch {
      setDiffResult(null)
    } finally {
      setDiffLoading(false)
    }
  }

  const statusFiles = git.status.filter((s) => s.workdir !== 1 || s.head !== 1)

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border/60 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-lg bg-primary/10 ring-1 ring-primary/20">
            <GitBranch className="size-3.5 text-primary" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight leading-none">Git</h3>
            <p className="text-[10px] text-muted-foreground/40 leading-none mt-1">
              {git.isInitialized ? `Branch: ${git.currentBranch}` : "Repository not initialized"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {!git.isInitialized ? (
            <Button size="sm" onClick={git.init} className="h-7 gap-1.5 text-xs font-medium">
              <GitBranch className="size-3.5" />
              Init repo
            </Button>
          ) : (
            <Button size="sm" onClick={() => setCommitDialogOpen(true)} className="h-7 gap-1.5 text-xs font-medium">
              <GitCommit className="size-3.5" />
              Commit
            </Button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {git.error && (
        <div className="flex items-center gap-2 border-b border-destructive/20 bg-destructive/5 px-4 py-2 text-xs text-destructive">
          <AlertCircle className="size-3.5 shrink-0" />
          <span>{git.error}</span>
        </div>
      )}

      {/* Main content */}
      {git.isInitialized ? (
        <Tabs defaultValue="history" className="flex-1 flex flex-col min-h-0">
          <TabsList className="mx-4 mt-3 mb-2 h-7 w-auto self-start rounded-lg border border-border/40 bg-muted/30 p-0.5">
            <TabsTrigger value="history" className="h-6 px-3 text-[11px] font-medium data-[state=active]:bg-background data-[state=active]:shadow-xs">
              History
            </TabsTrigger>
            <TabsTrigger value="status" className="h-6 px-3 text-[11px] font-medium data-[state=active]:bg-background data-[state=active]:shadow-xs">
              Status
              {statusFiles.length > 0 && (
                <Badge variant="secondary" className="ml-1.5 h-4 min-w-4 px-1 text-[9px]">
                  {statusFiles.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="diff" className="h-6 px-3 text-[11px] font-medium data-[state=active]:bg-background data-[state=active]:shadow-xs">
              Diff
            </TabsTrigger>
          </TabsList>

          <TabsContent value="history" className="flex-1 min-h-0 m-0 px-4 pb-4">
            <ScrollArea className="h-full pr-2">
              <div className="space-y-1">
                {git.commits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-2xl bg-muted/20 p-5 mb-3 ring-1 ring-border/40">
                      <GitCommitHorizontal className="size-8 text-muted-foreground/20" />
                    </div>
                    <p className="text-sm font-medium text-foreground/80">No commits yet</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">Make your first commit to track changes</p>
                  </div>
                ) : (
                  git.commits.map((c) => (
                    <CommitRow key={c.oid} commit={c} onDiff={(oid) => handleDiff(oid, c.oid)} />
                  ))
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="status" className="flex-1 min-h-0 m-0 px-4 pb-4">
            <ScrollArea className="h-full pr-2">
              <div className="space-y-1">
                {statusFiles.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle2 className="size-8 text-emerald-500/40 mb-3" />
                    <p className="text-sm font-medium text-foreground/80">Working tree clean</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">No changes to commit</p>
                  </div>
                ) : (
                  statusFiles.map((s) => <StatusRow key={s.filepath} status={s} />)
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="diff" className="flex-1 min-h-0 m-0 px-4 pb-4">
            <ScrollArea className="h-full pr-2">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <select
                    className="h-7 rounded-md border border-border bg-muted/30 px-2 text-xs"
                    onChange={(e) => {
                      const [a, b] = e.target.value.split("..")
                      if (a && b) handleDiff(a, b)
                    }}
                  >
                    <option value="">Select commits to compare</option>
                    {git.commits.map((c, i) =>
                      git.commits.slice(i + 1).map((d) => (
                        <option key={`${d.oid}..${c.oid}`} value={`${d.oid}..${c.oid}`}>
                          {d.message.slice(0, 30)}... → {c.message.slice(0, 30)}...
                        </option>
                      ))
                    )}
                  </select>
                </div>

                {diffLoading && (
                  <div className="flex items-center justify-center py-8 gap-2">
                    <Loader2 className="size-4 animate-spin text-primary" />
                    <span className="text-xs text-muted-foreground">Computing diff…</span>
                  </div>
                )}

                {!diffLoading && diffResult && diffResult.length === 0 && (
                  <p className="text-xs text-muted-foreground py-4">No differences found.</p>
                )}

                {!diffLoading &&
                  diffResult?.map((entry) => (
                    <div key={entry.filepath} className="rounded-lg border border-border/60 overflow-hidden">
                      <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 text-xs font-medium text-foreground/80 border-b border-border/40">
                        <FileText className="size-3.5 text-muted-foreground" />
                        {entry.filepath}
                      </div>
                      <div className="p-2 space-y-0.5 bg-background">
                        {entry.lines.slice(0, 200).map((line, idx) => (
                          <div
                            key={idx}
                            className={cn(
                              "text-[11px] font-mono px-1.5 py-0.5 rounded",
                              line.type === "add" && "bg-emerald-500/10 text-emerald-700",
                              line.type === "remove" && "bg-red-500/10 text-red-700",
                              line.type === "context" && "text-muted-foreground"
                            )}
                          >
                            {line.type === "add" ? "+ " : line.type === "remove" ? "- " : "  "}
                            {line.text}
                          </div>
                        ))}
                        {entry.lines.length > 200 && (
                          <p className="text-[10px] text-muted-foreground px-1.5 py-1">
                            +{entry.lines.length - 200} more lines…
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center text-center px-6">
          <div className="rounded-2xl bg-muted/20 p-6 mb-4 ring-1 ring-border/40">
            <GitBranch className="size-10 text-muted-foreground/20" />
          </div>
          <p className="text-sm font-semibold text-foreground/80">No Git repository</p>
          <p className="text-xs text-muted-foreground/60 mt-1.5 max-w-[240px] leading-relaxed">
            Initialize a repository to version your collections locally with Git.
          </p>
          <Button size="sm" onClick={git.init} className="mt-5 h-8 gap-1.5 text-xs font-medium">
            <GitBranch className="size-3.5" />
            Initialize repository
          </Button>
        </div>
      )}

      {/* Commit dialog */}
      <Dialog open={commitDialogOpen} onOpenChange={setCommitDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <GitCommit className="size-4 text-primary" />
              Commit changes
            </DialogTitle>
          </DialogHeader>
          <Textarea
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Describe your changes…"
            className="min-h-[80px] text-sm resize-none"
          />
          <DialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setCommitDialogOpen(false)} className="text-xs">
              Cancel
            </Button>
            <Button size="sm" onClick={handleCommit} disabled={!commitMessage.trim()} className="text-xs">
              Commit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function CommitRow({ commit, onDiff }: { commit: GitCommitType; onDiff: (oid: string) => void }) {
  const date = new Date(commit.author.timestamp * 1000).toLocaleString()
  return (
    <div className="group flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-accent/50 transition-colors">
      <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-1 ring-primary/20">
        <GitCommitHorizontal className="size-3 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-foreground truncate">{commit.message}</p>
        <p className="text-[10px] text-muted-foreground/60">
          {commit.author.name} • {date}
        </p>
      </div>
      <code className="hidden sm:inline-block text-[10px] text-muted-foreground/40 font-mono bg-muted/30 px-1 rounded shrink-0">
        {commit.oid.slice(0, 7)}
      </code>
      <Button
        variant="ghost"
        size="sm"
        className="size-6 p-0 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-foreground transition-opacity"
        onClick={() => onDiff(commit.oid)}
        title="Diff with previous"
      >
        <Diff className="size-3" />
      </Button>
    </div>
  )
}

function StatusRow({ status }: { status: FileStatus }) {
  let label = "modified"
  let icon = <Circle className="size-3 text-amber-500" />
  if (status.head === 0 && status.workdir === 1) {
    label = "new"
    icon = <Plus className="size-3 text-emerald-500" />
  } else if (status.head === 1 && status.workdir === 0) {
    label = "deleted"
    icon = <FileText className="size-3 text-red-500" />
  }

  return (
    <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-accent/50 transition-colors">
      {icon}
      <span className="flex-1 min-w-0 text-xs text-foreground truncate">{status.filepath}</span>
      <Badge variant="outline" className="text-[9px] h-4 px-1.5">
        {label}
      </Badge>
    </div>
  )
}
