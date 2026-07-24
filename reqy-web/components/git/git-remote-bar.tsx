"use client";

import { useState } from "react";
import { Globe, Plus, Trash2, Download, Upload, Cloud, GitFork, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import type { RemoteInfo } from "@/hooks/use-git";

interface RemoteBarProps {
  remotes: RemoteInfo[];
  currentBranch: string;
  onAdd: (name: string, url: string) => void;
  onRemove: (name: string) => void;
  onPush: (remote: string, branch: string) => void;
  onForcePush: (remote: string, branch: string) => void;
  onPull: (remote: string, branch: string) => void;
  onFetch: (remote: string) => void;
  onClone: (url: string, destPath: string) => void;
}

export function GitRemoteBar({
  remotes,
  currentBranch,
  onAdd,
  onRemove,
  onPush,
  onForcePush,
  onPull,
  onFetch,
  onClone,
}: RemoteBarProps) {
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [forcePushDialog, setForcePushDialog] = useState<{ remote: string; branch: string } | null>(
    null,
  );
  const [remoteName, setRemoteName] = useState("origin");
  const [remoteUrl, setRemoteUrl] = useState("");
  const [cloneUrl, setCloneUrl] = useState("");
  const [cloneDest, setCloneDest] = useState("");

  return (
    <Card className="p-2 space-y-1.5">
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <Globe className="size-3" />
          Remotes
        </span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => setCloneDialogOpen(true)}
          >
            <GitFork className="size-3" />
            Clone
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs gap-1"
            onClick={() => setAddDialogOpen(true)}
          >
            <Plus className="size-3" />
            Add
          </Button>
        </div>
      </div>

      {remotes.length === 0 ? (
        <p className="text-[10px] text-muted-foreground/40 px-1">No remotes configured</p>
      ) : (
        remotes.map((r) => (
          <div
            key={r.name}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent/50"
          >
            <Cloud className="size-3 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <span className="text-xs font-medium">{r.name}</span>
              <span className="text-[10px] text-muted-foreground/60 ml-2 truncate">{r.url}</span>
            </div>
            <div className="flex gap-0.5 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={() => onFetch(r.name)}
                title="Fetch"
              >
                <Download className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={() => onPull(r.name, currentBranch)}
                title="Pull"
              >
                <Cloud className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0"
                onClick={() => onPush(r.name, currentBranch)}
                title="Push"
              >
                <Upload className="size-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0 text-warning/60 hover:text-warning"
                onClick={() => setForcePushDialog({ remote: r.name, branch: currentBranch })}
                title="Force Push — overwrite remote history"
              >
                <AlertTriangle className="size-2.5" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="size-6 p-0 text-destructive/60"
                onClick={() => onRemove(r.name)}
                title="Remove"
              >
                <Trash2 className="size-3" />
              </Button>
            </div>
          </div>
        ))
      )}

      {/* Add remote dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Add remote</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={remoteName}
              onChange={(e) => setRemoteName(e.target.value)}
              placeholder="origin"
              className="text-sm"
            />
            <Input
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setAddDialogOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onAdd(remoteName, remoteUrl);
                setAddDialogOpen(false);
              }}
              disabled={!remoteName.trim() || !remoteUrl.trim()}
              className="text-xs"
            >
              Add
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Clone dialog */}
      <Dialog open={cloneDialogOpen} onOpenChange={setCloneDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">Clone repository</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={cloneUrl}
              onChange={(e) => setCloneUrl(e.target.value)}
              placeholder="https://github.com/user/repo.git"
              className="text-sm"
            />
            <Input
              value={cloneDest}
              onChange={(e) => setCloneDest(e.target.value)}
              placeholder="./my-repo"
              className="text-sm"
            />
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setCloneDialogOpen(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={() => {
                onClone(cloneUrl, cloneDest);
                setCloneDialogOpen(false);
              }}
              disabled={!cloneUrl.trim() || !cloneDest.trim()}
              className="text-xs"
            >
              Clone
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Force Push confirmation dialog */}
      <Dialog open={!!forcePushDialog} onOpenChange={(open) => !open && setForcePushDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm text-destructive">
              <AlertTriangle className="size-4" />
              Force push?
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground leading-relaxed">
              This will <strong>overwrite remote history</strong> for branch{" "}
              <code className="text-xs bg-muted px-1 rounded">
                {forcePushDialog?.branch ?? "?"}
              </code>{" "}
              on{" "}
              <code className="text-xs bg-muted px-1 rounded">
                {forcePushDialog?.remote ?? "?"}
              </code>
              .
            </p>
            <p className="text-xs text-destructive/80 leading-relaxed">
              Other collaborators will need to rebase their work. This is irreversible—proceed only
              if you're sure.
            </p>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setForcePushDialog(null)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => {
                if (forcePushDialog) {
                  onForcePush(forcePushDialog.remote, forcePushDialog.branch);
                }
                setForcePushDialog(null);
              }}
              className="text-xs gap-1.5"
            >
              <AlertTriangle className="size-3" />
              Force push
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
