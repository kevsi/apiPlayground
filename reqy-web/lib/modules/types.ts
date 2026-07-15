/**
 * Module contract — shared types for first-party Reqly modules.
 *
 * A module is a self-contained feature (UI, lib logic, or both) that is NOT
 * part of the generic international app core. Modules are declared through a
 * {@link ModuleManifest} and collected by the registry in `lib/modules/registry.ts`.
 *
 * Wiring (showing a module in the nav, mounting its route, loading its code)
 * is driven by the `enabled` flag + the app reading the registry. Until a
 * module is wired, its code stays out of the app bundle and its manifest is
 * simply not surfaced.
 */

export interface ModuleNavItem {
  /** Sidebar label, e.g. "Mobile Money". */
  label: string;
  /** Route path the module is mounted at, e.g. "/mobile-money/". */
  href: string;
  /** Icon key (resolved by the sidebar when wiring happens). */
  icon?: string;
}

export interface ModuleManifest {
  /** Unique, stable id (slug). Used as the lookup key and in URLs. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Semver string. */
  version: string;
  /** Short description for the module catalog / marketplace. */
  description?: string;
  /**
   * Master switch. When false the module is registered but NOT surfaced in
   * the app (nav, routes, code loading). Flip to true (and wire the app to
   * read the registry) to activate it.
   */
  enabled: boolean;
  /** Optional sidebar contribution, shown only when `enabled`. */
  nav?: ModuleNavItem;
}
