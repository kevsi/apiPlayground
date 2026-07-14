// Allow vitest's `?fresh` query imports (forces a fresh module instance for
// isolated store tests). Without this, `tsc` cannot resolve the `*?fresh`
// specifier used in store-initializer.test.tsx.
declare module "*?fresh";
