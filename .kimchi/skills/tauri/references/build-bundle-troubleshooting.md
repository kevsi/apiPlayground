# Build, Bundle, Updater, Troubleshooting (Tauri v2)

## Commandes essentielles

```bash
cargo tauri dev              # dev avec hot-reload frontend
cargo tauri build            # build release pour l'OS courant
cargo tauri build --target universal-apple-darwin   # binaire universel macOS (Intel + Apple Silicon)
cargo tauri ios build        # build iOS (v2 ajoute le support mobile natif)
cargo tauri android build    # build Android
cargo tauri migrate          # migration automatisée depuis v1 (partielle — le code Rust n'est pas migré automatiquement)
```

## Bundler intégré

Formats générés selon l'OS : `.app`/`.dmg` (macOS), `.deb`/`.rpm`/`.AppImage` (Linux), `.exe` (NSIS) / `.msi` (WiX) (Windows). Configuré sous la clé `bundle` de `tauri.conf.json` (icônes, identifiant, ressources embarquées, `externalBin` pour les sidecars).

⚠️ `identifier` dans `tauri.conf.json` **doit être changé** de sa valeur par défaut avant tout build release, sous peine d'échec explicite du bundler.

## Prérequis système par OS

- **Linux** : `webkit2gtk` — **4.1** pour Tauri v2 (ex. Ubuntu 22.04+), alors que v1 utilisait 4.0 (Ubuntu 18.04). Une erreur de lib manquante en Linux/WSL2 pointe presque toujours vers la mauvaise version de webkit2gtk installée.
- **Windows** : WebView2 (préinstallé sur Windows 10/11 récents, sinon à installer) + toolchain MSVC pour Rust.
- **macOS** : Xcode command line tools.

## Signature et mise à jour (plugin `updater`)

- Générer une paire de clés de signature, passer la clé privée via les variables d'env `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` au moment du build — jamais commiter la clé privée.
- Deux modes : serveur d'update dynamique, ou fichier JSON statique hébergé (GitHub Releases, S3, gist) avec les champs `version`, `platforms.[target].url`, `platforms.[target].signature`.
- Windows : `installMode` — `"passive"` (recommandé, petite UI sans interaction), `"basicUi"` (interaction requise), `"quiet"` (aucune UI, nécessite déjà des droits admin).
- Sur Windows, l'app se ferme automatiquement pendant l'installation de la mise à jour (limitation de l'installeur Windows, pas un bug Tauri).

## CI/CD (GitHub Actions typique)

- Jobs séparés par OS (Linux/macOS/Windows), Apple Silicon par défaut sur GitHub-hosted macOS runners → ajouter la target Intel explicitement si besoin d'un binaire universel.
- Pour mobile, jobs séparés iOS/Android avec ajout des targets Rust nécessaires (`rustup target add aarch64-linux-android ...`).

## Erreurs fréquentes rencontrées en environnement Windows/WSL2 (pertinent pour un setup type Alex)

| Erreur | Cause / fix |
|---|---|
| `EPERM: operation not permitted, copyfile` pendant le build | Conflit entre un fichier et un dossier de même nom dans le dossier de sortie (résidu d'un ancien build) — nettoyer `src-tauri/target` et le dossier `frontendDist` avant de rebuild |
| Requêtes localhost bloquées uniquement en build release | Protection SSRF de Tauri/du plugin `http` plus stricte en release qu'en dev — ajouter explicitement un scope autorisant `http://localhost:*` ou `127.0.0.1` dans la capability concernée si c'est un besoin légitime (ex. proxy interne pour bypasser CORS) |
| Le runtime Tokio "fuit" / handles qui s'accumulent | Vérifier qu'aucune tâche `tokio::spawn`/`async_runtime::spawn` de longue durée n'est relancée à chaque appel de commande sans mécanisme d'arrêt — garder une référence (`JoinHandle`) dans le state managé pour pouvoir `.abort()` proprement |
| Build qui échoue seulement sous WSL2 mais marche en natif Linux | Souvent lié à un projet cloné sous `/mnt/c/...` (I/O lent + parfois problèmes de permissions cross-filesystem) plutôt que dans le filesystem natif WSL (`~/`) — recommandé de toujours cloner les projets Tauri dans le filesystem Linux natif |
| Écran blanc au lancement en release alors que ça marchait en dev | Souvent un chemin d'asset cassé (`frontendDist` pointant vers le mauvais dossier, ou `assetPrefix`/base path du framework mal configuré pour un contexte "file://" plutôt que "http://") |

## Migration v1 → v2 — check-list rapide

- `allowlist` (v1) → `capabilities/*.json` + `permissions` (v2).
- `distDir`/`devPath` (v1) → `frontendDist`/`devUrl` (v2).
- `tauri::Builder` reste similaire mais les imports de plugins ont changé de crate (chaque plugin officiel est maintenant un crate séparé `tauri-plugin-*` au lieu d'être inclus dans le core).
- webkit2gtk 4.0 → 4.1 sur Linux.
- Le CLI fournit `cargo tauri migrate` pour automatiser la config, mais le code Rust métier (surtout tout ce qui touchait à `allowlist`/API core directement) doit être revu à la main.