# Verification Report — Tauri v2 Corrections (Reqly)

## Issues Corrected

### Issue 1 — `export_json` no longer bypasses Tauri scopes (partially)
- **File**: `src-tauri/src/lib.rs`
- **Status**: FIXED (with documented limitation)
- **Changes**:
  - Removed dependency on `rfd::FileDialog` and `std::fs`.
  - Removed imports: `rfd::FileDialog`, `std::fs`.
  - Added imports: `tauri_plugin_dialog::DialogExt`, `tauri_plugin_fs::{FilePath, FsExt, OpenOptions}`, `std::io::Write`.
  - `export_json` now takes an `AppHandle` and uses `app.dialog().file().add_filter(...).set_file_name(...).blocking_save_file()` (Tauri dialog plugin) to pick the destination.
  - File write is performed via `app.fs().open(path, OpenOptions::new().write(true).create(true).truncate(true))` and `write_all`.
- **Limitation**: `tauri-plugin-fs` 2.5.1 does NOT expose a public `write` / `write_text_file` Rust function; the scope-checking `write_file_inner` command requires a `Webview<R>` (it can only be invoked from the frontend). The available Fs API is `open` which returns a plain `std::fs::File`. The dialog plugin's scope/permissions are respected (the file pick is now mediated by Tauri), but the Rust-side write does not re-check the `$APPDATA/Reqly/**` scope because backend Tauri commands are not in that scope-enforcement path. This matches the review's note that the actual scope enforcement happens at the IPC/command layer.

### Issue 2 — Race condition on quick proxy restart
- **File**: `src-tauri/src/lib.rs`
- **Status**: FIXED
- **Changes**:
  - `CaptureProxyState` now also stores `server_thread: Option<std::thread::JoinHandle<()>>`.
  - `start_proxy_server` captures the `JoinHandle` returned by `std::thread::spawn` and stores it in the state after spawn (second lock acquisition, no deadlock — guard dropped between).
  - `stop_capture_proxy` now:
    1. Takes the flag out and stores `Ordering::SeqCst`.
    2. Takes the `JoinHandle` out.
    3. Drops the mutex guard.
    4. Calls `handle.join()` to block until the proxy thread has actually released the socket.

### Issue 3 — Port validation incomplete
- **File**: `src-tauri/src/lib.rs`
- **Status**: FIXED
- **Change**: `start_capture_proxy` now rejects ports above 65535: `if port < 1024 || port > 65535 { return Err("Port must be between 1024 and 65535".to_string()); }`.

### Issue 4 — Memory ordering on shutdown flag
- **File**: `src-tauri/src/lib.rs`
- **Status**: FIXED
- **Changes**:
  - `flag.store(true, Ordering::SeqCst)` in `stop_capture_proxy`.
  - `flag_for_server.load(Ordering::SeqCst)` inside the proxy thread loop.

## Files Modified

- `src-tauri/src/lib.rs` — imports, `export_json`, `CaptureProxyState`, `start_proxy_server`, `start_capture_proxy`, `stop_capture_proxy`.

No changes were required in `src-tauri/capabilities/default.json`:
- `dialog:allow-save` is already present.
- `fs:allow-write-text-file` is already present.
- `allow-export-json` is already present.

## Cargo Check Result

`cargo check` from `src-tauri/` **fails before reaching our code** with a purely environmental error:

```
error: failed to run custom build command for `gobject-sys v0.18.0`
...
The pkg-config command could not be found.
Most likely, you need to install a pkg-config package for your OS.
Try `apt install pkg-config`, or `yum install pkg-config`, ...
```

This is the same environment-only failure flagged in the original review (`error: failed to run custom build command for glib-sys`). It is not a regression introduced by these edits. No code-level errors were emitted by the Rust compiler before the build script failure (the failure happens during resolution of `glib-sys` / `gobject-sys`, well before our crate's source is type-checked).

Because of this, full Rust compilation cannot be verified in the current sandbox. The edits were reviewed manually against:
- `tauri-plugin-fs` 2.5.1 source (`FsExt`, `Fs::open`, `OpenOptions`, `FilePath::into_path` exist as used).
- `tauri-plugin-dialog` 2.7.1 source (`DialogExt::dialog().file().blocking_save_file()` exists with the signature used).
- `tauri::AppHandle` `dialog()` / `fs()` accessors via the `DialogExt` and `FsExt` traits.

## Verdict

**HAS_FAILURES** (environment-only)

- All 4 issues from the review were applied to the source code.
- `cargo check` could not be executed to completion due to a missing `pkg-config` / system libraries (`glib-2.0`, `gobject-2.0`) on this Linux sandbox. This is the same environment limitation noted in the original review. The build script failure happens before any of the modified Rust files are type-checked, so no code-level regression can be confirmed or ruled out from this run.

## Remaining Work for the Orchestrator

1. Run `cargo check` (and ideally `cargo build`) inside `src-tauri/` on a machine with Tauri system dependencies installed (`pkg-config`, `libgtk-3-dev`, `libwebkit2gtk-4.1-dev`, `libssl-dev`, etc., per the Tauri v2 prerequisites).
2. Confirm that `app.fs().open(path_str, OpenOptions::new().write(true).create(true).truncate(true))` resolves to the expected signature on the target platform. The call was based on `tauri-plugin-fs` 2.5.1 desktop source (`src/desktop.rs: pub fn open<P: Into<FilePath>>(&self, path: P, opts: OpenOptions) -> std::io::Result<std::fs::File>`). Passing `&str` works because `&str: Into<FilePath>` via `FilePath::Path(PathBuf::from(...))`.
3. Optional follow-up (out of scope for this fix pass): the write is still performed by backend code via the fs plugin's `open`, so the `$APPDATA/Reqly/**` scope is not enforced for this path. If strict scope enforcement is required, the cleanest solution remains the review's alternative: drop `export_json` and call the frontend `downloadJson` (`reqy-web/lib/utils.ts`), which uses `@tauri-apps/plugin-fs` `writeTextFile` and is fully scope-checked.
