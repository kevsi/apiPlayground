import type { ModuleManifest } from "@/lib/modules/types";

/**
 * Manifest for the MTN MoMo module.
 *
 * The module code lives in `modules/mobile-money/`. It is registered here but
 * kept `enabled: false` on purpose: the app does not surface it yet (no nav
 * entry, no mounted route, code not loaded). Flip `enabled` to true and wire
 * the sidebar/routes to `getModuleNavItems()` / `getEnabledModules()` to
 * activate it.
 */
export const mobileMoneyManifest: ModuleManifest = {
  id: "mtn-momo",
  name: "MTN MoMo",
  version: "0.1.0",
  description: "Mobile Money callback simulator (MTN MoMo, FedaPay, Kkiapay).",
  enabled: false,
  nav: {
    label: "Mobile Money",
    href: "/mobile-money/",
    icon: "Smartphone",
  },
};
