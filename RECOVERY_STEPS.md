# Recovery steps for pnpm + Turbopack workspace fix

## Step 1 — Stop any running `pnpm tauri:dev` / `cargo` / `next dev`

Press `Ctrl+C` in the terminal running Tauri dev.

## Step 2 — Force a clean reinstall from workspace root

In **PowerShell** at `C:\Users\alexanders\Documents\Workspace\apiPlayground-main`:

```powershell
# Clean lockfile + all node_modules directories
Remove-Item -Recurse -Force .\pnpm-lock.yaml -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\reqy-web\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\reqy-cli\node_modules -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force .\reqy-mcp\node_modules -ErrorAction SilentlyContinue

# Reinstall from workspace root (so pnpm sees the new .npmrc)
pnpm install
```

## Step 3 — Restart Tauri

```powershell
pnpm tauri:dev
```

## What should happen

- pnpm will create a flat `node_modules/` at the workspace root (thanks to `shamefully-hoist=true`)
- `next` will be hoisted to `apiPlayground-main/node_modules/next/` (accessible to both Turbopack and the workspace packages)
- Turbopack should find Next.js and the Rust compile should proceed

## If it still fails

Tell me:
1. The exact error message (especially the part after "couldn't find")
2. Whether `pnpm install` output shows the new flat structure (look for `node_modules/` being created at the root, not just inside each workspace package)

---

**Note**: if `Remove-Item -Recurse -Force` is too slow on Windows due to file locks, close any editor/IDE that might have files open in the project, then retry.
