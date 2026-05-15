"use client"

import { useState } from "react"
import { Check, ChevronsUpDown, Plus, Settings2, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { useRequestStore, type Environment, type EnvironmentVariable } from "@/hooks/use-request-store"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Checkbox } from "@/components/ui/checkbox"

export function EnvironmentSelector() {
  const { environments, activeEnvironmentId, setActiveEnvironment, addEnvironment, updateEnvironment, deleteEnvironment } = useRequestStore()
  
  const [isManageOpen, setIsManageOpen] = useState(false)
  const [editingEnvId, setEditingEnvId] = useState<string | null>(null)
  
  // Find active env
  const activeEnv = environments.find(e => e.id === activeEnvironmentId) || environments[0]

  const handleCreateNew = () => {
    const newId = addEnvironment({
      name: "New Environment",
      color: "slate",
      variables: [{ key: "BASE_URL", value: "http://localhost:3000", enabled: true }]
    })
    setEditingEnvId(newId)
    setIsManageOpen(true)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-2 border-dashed font-normal">
            <div className={cn("size-2 rounded-full", activeEnv ? `bg-${activeEnv.color}-500` : "bg-slate-500")} />
            {activeEnv ? activeEnv.name : "No Environment"}
            <ChevronsUpDown className="size-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuLabel className="text-xs text-muted-foreground">Environments</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {environments.map((env) => (
            <DropdownMenuItem
              key={env.id}
              onClick={() => setActiveEnvironment(env.id)}
              className="flex items-center gap-2"
            >
              <div className={cn("size-2 rounded-full", `bg-${env.color}-500`)} />
              <span className="flex-1 truncate">{env.name}</span>
              {activeEnvironmentId === env.id && <Check className="size-3.5 text-primary" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsManageOpen(true)} className="gap-2">
            <Settings2 className="size-3.5" />
            Manage Environments
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleCreateNew} className="gap-2">
            <Plus className="size-3.5" />
            New Environment
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ManageEnvironmentsDialog 
        open={isManageOpen} 
        onOpenChange={setIsManageOpen} 
        initialEditingId={editingEnvId}
      />
    </>
  )
}

function ManageEnvironmentsDialog({ open, onOpenChange, initialEditingId }: { open: boolean, onOpenChange: (open: boolean) => void, initialEditingId: string | null }) {
  const { environments, addEnvironment, updateEnvironment, deleteEnvironment } = useRequestStore()
  const [selectedId, setSelectedId] = useState<string | null>(initialEditingId || (environments.length > 0 ? environments[0].id : null))

  // Update selected if initial changes or if deleted
  if (open && initialEditingId && initialEditingId !== selectedId) {
    setSelectedId(initialEditingId)
  }

  const selectedEnv = environments.find(e => e.id === selectedId)

  const handleAddVar = () => {
    if (!selectedEnv) return
    updateEnvironment(selectedEnv.id, {
      variables: [...selectedEnv.variables, { key: "", value: "", enabled: true }]
    })
  }

  const updateVar = (index: number, field: keyof EnvironmentVariable, value: string | boolean) => {
    if (!selectedEnv) return
    const newVars = [...selectedEnv.variables]
    newVars[index] = { ...newVars[index], [field]: value }
    updateEnvironment(selectedEnv.id, { variables: newVars })
  }

  const removeVar = (index: number) => {
    if (!selectedEnv) return
    const newVars = [...selectedEnv.variables]
    newVars.splice(index, 1)
    updateEnvironment(selectedEnv.id, { variables: newVars })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] p-0 gap-0 flex overflow-hidden">
        <DialogTitle className="sr-only">Manage Environments</DialogTitle>
        {/* Left Sidebar */}
        <div className="w-1/3 border-r bg-muted/20 flex flex-col">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold text-sm">Environments</h3>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => {
               const newId = addEnvironment({
                name: "New Environment",
                color: "slate",
                variables: []
              })
              setSelectedId(newId)
            }}>
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {environments.map(env => (
              <button
                key={env.id}
                onClick={() => setSelectedId(env.id)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm text-left transition-colors",
                  selectedId === env.id ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                )}
              >
                <div className={cn("size-2 rounded-full shrink-0", `bg-${env.color}-500`)} />
                <span className="truncate flex-1">{env.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Right Content */}
        <div className="flex-1 flex flex-col bg-background">
          {selectedEnv ? (
            <>
              <div className="p-4 border-b flex items-center gap-4">
                <Input 
                  value={selectedEnv.name}
                  onChange={(e) => updateEnvironment(selectedEnv.id, { name: e.target.value })}
                  className="max-w-[300px] font-semibold text-lg h-9 border-transparent hover:border-border focus-visible:border-border px-2"
                />
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 ml-auto text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (environments.length === 1) return // Don't delete last env
                    deleteEnvironment(selectedEnv.id)
                    setSelectedId(environments.find(e => e.id !== selectedEnv.id)?.id || null)
                  }}
                  disabled={environments.length <= 1}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Variables</h4>
                    <Button variant="outline" size="sm" onClick={handleAddVar} className="h-7 text-xs">
                      <Plus className="size-3 mr-1" /> Add Variable
                    </Button>
                  </div>
                  
                  <div className="border rounded-md divide-y">
                    <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 p-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                      <div className="w-6" />
                      <div>VARIABLE</div>
                      <div>VALUE</div>
                      <div className="w-8" />
                    </div>
                    {selectedEnv.variables.length === 0 ? (
                      <div className="p-8 text-center text-sm text-muted-foreground">
                        No variables defined.
                      </div>
                    ) : (
                      selectedEnv.variables.map((v, i) => (
                        <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 p-2 items-center group">
                          <div className="w-6 flex justify-center">
                            <Checkbox 
                              checked={v.enabled} 
                              onCheckedChange={(c) => updateVar(i, "enabled", !!c)}
                            />
                          </div>
                          <Input 
                            value={v.key} 
                            onChange={(e) => updateVar(i, "key", e.target.value)}
                            placeholder="KEY"
                            className="h-8 font-mono text-xs"
                          />
                          <Input 
                            value={v.value} 
                            onChange={(e) => updateVar(i, "value", e.target.value)}
                            placeholder="value"
                            className="h-8 font-mono text-xs"
                          />
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => removeVar(i)}
                            className="size-8 opacity-0 group-hover:opacity-100 text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-muted-foreground">
              Select an environment
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
