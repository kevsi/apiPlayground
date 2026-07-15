import { describe, it, expect } from "vitest";
import {
  getAllModules,
  getEnabledModules,
  getModuleNavItems,
  getModuleById,
} from "@/lib/modules/registry";
import type { ModuleNavItem } from "@/lib/modules/types";

describe("module registry", () => {
  it("lists all registered modules", () => {
    const ids = getAllModules().map((m) => m.id);
    expect(ids).toContain("mtn-momo");
  });

  it("excludes disabled modules from the enabled set", () => {
    // MTN MoMo is registered but not wired into the app surface yet.
    expect(getEnabledModules()).toHaveLength(0);
  });

  it("returns no nav items while modules are disabled", () => {
    const items: ModuleNavItem[] = getModuleNavItems();
    expect(items).toHaveLength(0);
  });

  it("can look up a module by id", () => {
    expect(getModuleById("mtn-momo")?.name).toBe("MTN MoMo");
    expect(getModuleById("does-not-exist")).toBeUndefined();
  });
});
