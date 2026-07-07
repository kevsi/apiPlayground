---
name: tauri
description: >-
  Expertise Tauri v2 (Rust + webview) pour construire, deboguer et securiser des
  apps desktop/mobile locales-first, pertinent pour des projets comme Reqly (Tauri v2
  + Next.js export statique). A utiliser des que la conversation touche a Tauri :
  architecture Core Rust / WebView / IPC, commandes (tauri::command, invoke),
  permissions et capabilities (src-tauri/capabilities), tauri.conf.json, plugins
  officiels/communautaires, sidecars, State/Manager, events (emit/listen), fenetres
  multiples, updater, bundler (.msi/.dmg/.deb/.AppImage), integration frontend
  (Next.js/Vite/SvelteKit) en mode SSG, migration v1 vers v2, ou debug d'erreurs
  type "not allowed", CORS/SSRF localhost, EPERM copyfile, erreurs cargo/rustc,
  WSL2/webkit2gtk. Se declenche aussi pour "comment faire X en Tauri" meme sans le
  mot exact si le contexte est clairement une app Tauri en Rust avec webview desktop.
---



# Tauri v2 — Skill de référence

Tauri v2 est un framework qui empaquette un frontend web (HTML/CSS/JS — n'importe quel framework) dans une fenêtre native (WebView du système, pas de Chromium embarqué) pilotée par un binaire Rust. Le binaire Rust ("Core") gère les fenêtres, le système de fichiers, les processus, et expose des fonctions ("commands") au frontend via un pont IPC sécurisé.

## Quand aller plus loin dans les fichiers de référence

Ce fichier donne le socle mental + les pièges les plus fréquents. Pour le détail, ouvrir le fichier de référence pertinent :

| Besoin | Fichier |
|---|---|
| Système de permissions/capabilities, erreurs "command not allowed", CSP, scopes | `references/capabilities-permissions.md` |
| Commands Rust↔JS, `invoke`, State/Manager, events, fenêtres multiples | `references/commands-ipc-state.md` |
| Intégrer un frontend (Next.js export statique, Vite, SvelteKit) | `references/nextjs-integration.md` |
| Plugins officiels, plugins tiers, sidecars (binaires externes/Python/Node) | `references/plugins-sidecar.md` |
| Build, bundler, updater, erreurs de compilation, WSL2/Windows/Linux | `references/build-bundle-troubleshooting.md` |

Chaque fichier fait <300 lignes et est autonome ; les lire seulement si la question touche vraiment ce sujet — ne pas tout charger pour une question simple.

## Architecture mentale (à garder en tête tout le temps)

```
┌─────────────────────────┐        IPC (invoke/emit)        ┌────────────────────────┐
│   WebView (frontend)     │ ◄─────────────────────────────► │   Core (Rust, tauri)    │
│  HTML/CSS/JS non-trusted │                                  │  accès total au système │
└─────────────────────────┘                                  └────────────────────────┘
```

- **Process model** : un processus Core (Rust) + un processus/webview par fenêtre — architecture multi-process comme un navigateur moderne. Un crash d'une fenêtre n'emporte pas le reste de l'app.
- **Trust boundary** : le code du frontend est considéré **non fiable par défaut** (dépendances npm compromises, XSS, etc.). Le Core, lui, a un accès total au système. L'IPC est la frontière : c'est pour ça que **tout accès à une "command" doit être explicitement autorisé via une capability** (voir plus bas). C'est le changement le plus important par rapport à Tauri v1, où tout était accessible par défaut.
- **Pas de serveur localhost** : contrairement à Electron, Tauri sert le frontend via un protocole webview natif, pas un serveur HTTP local — donc pas de port à sécuriser en prod (mais le dev server, lui, tourne bien en HTTP pendant `tauri dev`).
- **tauri.conf.json** est lu à la compilation : il configure les fenêtres, le build, le bundler, et référence les fichiers de capabilities.

## Les 3 pièges n°1 à vérifier en premier réflexe

1. **"command not allowed" / erreur silencieuse côté frontend** → 95% du temps c'est une capability manquante dans `src-tauri/capabilities/*.json`, pas un bug de code. Pas de vérification à la compilation : ça échoue seulement à l'exécution. → voir `references/capabilities-permissions.md`.
2. **Un plugin ajouté mais qui ne marche pas** → il faut à la fois (a) l'enregistrer dans `.plugin(tauri_plugin_x::init())` côté Rust ET (b) ajouter sa permission `x:default` (ou plus fine) dans une capability. Oublier l'un des deux = échec silencieux.
3. **Erreurs réseau/localhost en release alors que ça marchait en dev** → souvent une protection SSRF/CORS de Tauri ou du plugin `http`/`fs` qui bloque les requêtes locales en build release (comportement différent de `tauri dev`). Vérifier les scopes réseau explicitement pour `localhost`/`127.0.0.1` dans la capability concernée.

## Style de réponse attendu pour ce skill

- Toujours préciser si une info est **Tauri v1 vs v2** quand ça diffère (le vocabulaire a beaucoup changé : `allowlist` v1 → `capabilities`/`permissions` v2 ; `distDir`/`devPath` v1 → `frontendDist`/`devUrl` v2).
- Donner le chemin de fichier exact (`src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/lib.rs` ou `main.rs`) plutôt que des snippets flottants.
- Pour du debug, commencer par demander/vérifier : version de Tauri (v1/v2), OS cible, et si l'erreur apparaît en `tauri dev` ou seulement en `tauri build` release — ces trois éléments orientent complètement le diagnostic.
- Rappeler que "Rust ne compile pas" n'est presque jamais un problème Tauri en soi : bien distinguer erreurs cargo/rustc génériques des erreurs spécifiques à l'API Tauri.