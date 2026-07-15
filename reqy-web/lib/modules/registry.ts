import type { ModuleManifest, ModuleNavItem } from "./types";
import { mobileMoneyManifest } from "@/modules/mobile-money/manifest";

/**
 * Central registry of first-party Reqly modules.
 *
 * Each module contributes a {@link ModuleManifest} (see `modules/<id>/manifest.ts`).
 * Add a module by appending its manifest to `MODULES` below — the app later
 * reads this registry to surface enabled modules (nav items, routes, code).
 *
 * Modules are statically imported so their code can be tree-shaken and gated
 * by the `enabled` flag. This keeps disabled modules (e.g. MTN MoMo, not yet
 * wired) out of the shipped app bundle.
 */
const MODULES: ModuleManifest[] = [mobileMoneyManifest];

export function getAllModules(): ModuleManifest[] {
  return MODULES;
}

export function getEnabledModules(): ModuleManifest[] {
  return MODULES.filter((m) => m.enabled);
}

export function getModuleNavItems(): ModuleNavItem[] {
  return getEnabledModules()
    .filter((m) => m.nav)
    .map((m) => m.nav as ModuleNavItem);
}

export function getModuleById(id: string): ModuleManifest | undefined {
  return MODULES.find((m) => m.id === id);
}
