# Plugins & Sidecars (Tauri v2)

## Plugins officiels courants

`fs`, `dialog`, `shell`, `http`, `notification`, `clipboard-manager`, `global-shortcut`, `store` (persistance clé-valeur simple), `window-state` (sauvegarde position/taille des fenêtres), `updater`, `sql` (SQLite/MySQL/Postgres via sqlx), `deep-link`, `os`, `process`, `log`.

Ajout typique :

```bash
cargo add tauri-plugin-fs
# ou via l'outil dédié qui édite aussi les permissions par défaut :
cargo tauri add fs
```

```rust
tauri::Builder::default()
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_shell::init())
    .invoke_handler(tauri::generate_handler![...]);
```

**Deux étapes obligatoires et indépendantes pour qu'un plugin fonctionne** :
1. `.plugin(tauri_plugin_x::init())` côté Rust (`src-tauri/src/lib.rs`).
2. La permission correspondante (`x:default` ou plus fine) dans une capability (`src-tauri/capabilities/*.json`).

Oublier l'étape 2 est la cause n°1 de "le plugin ne fait rien" sans erreur de compilation.

## Plugins communautaires

Cherchés sur crates.io sous le nom `tauri-plugin-<nom>`. Contrairement aux plugins officiels, ils ne sont pas ajoutables via `cargo tauri add` — ajout manuel de la dépendance Cargo + init manuelle du builder.

## Sidecar (exécuter un binaire externe : Python, Node, autre)

Utile pour embarquer un processus tiers (ex. un moteur Python, un serveur local, un outil CLI) à côté du binaire Tauri, packagé et distribué avec l'app.

**Configuration** (`tauri.conf.json`) :
```json
{ "bundle": { "externalBin": ["binaries/my-sidecar"] } }
```
Le binaire doit être suffixé par le triple de la plateforme cible (ex. `my-sidecar-x86_64-pc-windows-msvc.exe`), généré via `rustc -Vv`.

**Rust — spawn et écoute des flux** :

```rust
use tauri_plugin_shell::ShellExt;
use tauri_plugin_shell::process::CommandEvent;

let sidecar = app_handle.shell().sidecar("my-sidecar")?;
let (mut rx, _child) = sidecar.spawn()?;

tauri::async_runtime::spawn(async move {
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(line) => {
                app_handle.emit("sidecar-stdout", String::from_utf8_lossy(&line).to_string()).ok();
            }
            CommandEvent::Stderr(line) => {
                app_handle.emit("sidecar-stderr", String::from_utf8_lossy(&line).to_string()).ok();
            }
            _ => {}
        }
    }
});
```

Nécessite le plugin `shell` avec la permission `shell:allow-execute` (ou une permission de sidecar spécifique selon la version) dans la capability.

### Pièges fréquents avec les sidecars

- **Binaire packagé avec PyInstaller (Python)** : des dépendances dynamiques (ex. lib Python partagée) peuvent ne pas être trouvées une fois lancées depuis Tauri car le `cwd`/chemin de résolution diffère d'un lancement manuel en terminal — souvent réglé via `--onefile` bien configuré et test explicite du chemin absolu.
- **Chemins relatifs** : un sidecar doit résoudre ses fichiers de données via `app_handle.path().app_data_dir()` (ou équivalent) plutôt qu'un chemin relatif au `cwd`, qui n'est pas garanti stable entre dev/release/OS.
- **Nettoyage à la fermeture** : toujours prévoir un shutdown propre du sidecar dans `RunEvent::ExitRequested` (kill process) pour éviter des processus zombies persistants — particulièrement visible sur Windows.

## Développer son propre plugin

Structure minimale : un crate Rust (`desktop.rs`/`mobile.rs` pour les implémentations spécifiques par plateforme, `commands.rs` pour les commandes exposées), plus éventuellement un package NPM de bindings JS. Le `build.rs` du plugin utilise une const `COMMANDS` pour générer automatiquement les permissions `allow-<cmd>`/`deny-<cmd>` à chaque commande listée. Pertinent seulement si Alex développe un plugin réutilisable (ex. logique commune extraite de Reqly) plutôt qu'une simple commande interne à l'app.