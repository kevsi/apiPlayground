"use client";

import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export interface KeyValuePair {
  key: string;
  value: string;
}

interface KeyValueEditorProps {
  pairs: KeyValuePair[];
  onChange: (pairs: KeyValuePair[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  addLabel?: string;
  emptyLabel?: string;
}

export function KeyValueEditor({
  pairs,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  addLabel = "Add",
  emptyLabel = "No items added yet",
}: KeyValueEditorProps) {
  const add = () => onChange([...pairs, { key: "", value: "" }]);

  const remove = (index: number) => {
    onChange(pairs.filter((_, i) => i !== index));
  };

  const update = (index: number, field: "key" | "value", value: string) => {
    onChange(
      pairs.map((pair, i) => (i === index ? { ...pair, [field]: value } : pair)),
    );
  };

  return (
    <div>
      {pairs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 text-xs text-muted-foreground/60">
          <span>{emptyLabel}</span>
        </div>
      ) : (
        <div className="space-y-2">
          {pairs.map((pair, index) => (
            <div
              key={index}
              className="group/row flex items-center gap-2 rounded-lg transition-all duration-200 hover:bg-muted/20 -mx-1 px-1"
            >
              <Input
                type="text"
                value={pair.key}
                onChange={(e) => update(index, "key", e.target.value)}
                placeholder={keyPlaceholder}
                className="flex-1 h-9 border-input bg-muted/20 text-sm transition-all duration-200 focus:bg-muted/40"
              />
              <span className="shrink-0 text-muted-foreground/30">=</span>
              <Input
                type="text"
                value={pair.value}
                onChange={(e) => update(index, "value", e.target.value)}
                placeholder={valuePlaceholder}
                className="flex-1 h-9 border-input bg-muted/20 text-sm transition-all duration-200 focus:bg-muted/40"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => remove(index)}
                className={cn(
                  "shrink-0 size-8 text-muted-foreground/50 hover:text-destructive",
                  "opacity-0 group-hover/row:opacity-100 transition-all duration-200",
                )}
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        variant="outline"
        onClick={add}
        className="mt-3 w-full border-dashed border-muted-foreground/20 text-muted-foreground/70 hover:text-foreground hover:border-muted-foreground/40 transition-all duration-200 h-9 text-xs font-medium"
      >
        <Plus className="size-3.5 mr-1" />
        {addLabel}
      </Button>
    </div>
  );
}
