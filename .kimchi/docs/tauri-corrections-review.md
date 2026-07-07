# Revue des corrections Tauri v2 — Reqly

## Verdict : NEEDS_FIXES

Les corrections demandées (permissions, scope fs, initialisation des plugins dialog/fs, gestion managée du state du proxy et redémarrage du proxy) ont été appliquées correctement. Cependant, un problème de sécurité significatif signalé dans le rapport de conformité initial reste non corrigé (`export_json` contourne le système de permissions/scopes de Tauri), et un risque de concurrence subsiste sur le redémarrage rapide du proxy.

## Issues

### 1. `export_json` contourne toujours le système de permissions Tauri (sécurité)

- **Fichier** : `/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/src-tauri/src/lib.rs`
- **Lignes** : 45-61
- **Description** : La commande `export_json` utilise `rfd::FileDialog` et `std::fs::write` au lieu des plugins Tauri `dialog` et `fs`. Par conséquent :
  - Le scope fs défini dans `default.json` (`$APPDATA/Reqly/**`) n'est pas appliqué.
  - La permission `allow-export-json` permet en pratique d'écrire du contenu JSON arbitraire à n'importe quel chemin choisi par l'utilisateur via une boîte de dialogue native.
  - Cela contredit le rapport de conformité initial (point 2) qui signalait déjà ce problème.
- **Suggestion de correction** : Réécrire `export_json` pour utiliser les APIs Tauri (`tauri_plugin_dialog` et `tauri_plugin_fs`) afin que le scope fs et les permissions dialog soient respectés. Alternativement, supprimer cette commande et utiliser systématiquement la fonction frontend `downloadJson` (`reqy-web/lib/utils.ts`) qui utilise déjà les bons plugins.

### 2. Risque de concurrence au redémarrage rapide du proxy capture

- **Fichier** : `/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/src-tauri/src/lib.rs`
- **Lignes** : 467-468 (`stop_capture_proxy`) et 432-446 (`start_capture_proxy`), 409-410 (`start_proxy_server`)
- **Description** : `stop_capture_proxy` retire immédiatement le drapeau du state (`guard.shutdown_flag.take()`) et retourne `Ok(())`, mais le thread du serveur (`std::thread::spawn`) peut encore être en train de libérer sa socket. Si `start_capture_proxy` est appelé immédiatement après sur le même port, le `Server::http(&addr)` peut échouer avec "Failed to bind port" car le port n'est pas encore libéré.
- **Suggestion de correction** : Conserver un handle du thread (`std::thread::JoinHandle<()>`) dans `CaptureProxyState` et attendre son terminaison (`join()`) avant de vider l'état, ou utiliser un mécanisme de notification (par exemple `tokio::sync::watch` / `oneshot`) indiquant que le thread s'est terminé.

### 3. Validation du port incomplète

- **Fichier** : `/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/src-tauri/src/lib.rs`
- **Ligne** : 432-435
- **Description** : La commande `start_capture_proxy` vérifie uniquement `if port < 1024` mais le message d'erreur indique "Port must be between 1024 and 65535". Une valeur comme `65536` passera donc la validation puis échouera à la création du `SocketAddr` avec un message moins clair.
- **Suggestion de correction** : Remplacer la vérification par `if port < 1024 || port > 65535`.

### 4. Ordering mémoire `Relaxed` pour le drapeau d'arrêt

- **Fichier** : `/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/src-tauri/src/lib.rs`
- **Lignes** : 409 (`flag.load(Ordering::Relaxed)`) et 469 (`flag.store(true, Ordering::Relaxed)`)
- **Description** : Le drapeau de shutdown est partagé entre le thread principal/invokeur et le thread du proxy. Avec `Ordering::Relaxed`, il n'y a aucune garantie de visibilité des autres données modifiées avant l'arrêt. Dans ce cas précis, le thread ne fait que lire le flag, donc le risque est limité, mais `Acquire`/`Release` ou `SeqCst` seraient plus robustes et conformes aux bonnes pratiques Rust pour un flag d'arrêt inter-thread.
- **Suggestion de correction** : Utiliser `flag.store(true, Ordering::Release)` côté arrêt et `flag.load(Ordering::Acquire)` côté thread serveur.

## Notes positives

- **Permissions `allow-*` ajoutées** : Toutes les commandes custom (`fetch_proxy`, `export_json`, `open_external`, `start_capture_proxy`, `stop_capture_proxy`, `ws_connect`, `ws_send`, `ws_disconnect`, `ws_get_status`) ont bien leur permission `allow-*` dans `/mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/src-tauri/capabilities/default.json`.
- **Scope fs restreint** : Le scope est correctement limité à `$APPDATA/Reqly/**`.
- **Plugins dialog/fs sur le builder** : `tauri_plugin_dialog::init()` et `tauri_plugin_fs::init()` sont désormais enregistrés directement sur le builder (`src-tauri/src/lib.rs:467-468`), plus dans `.setup()`.
- **State managé du proxy** : Le `OnceLock<Mutex<CaptureProxyState>>` global a été remplacé par `.manage::<ManagedCaptureProxyState>(Arc::new(Mutex::new(CaptureProxyState::default())))` (`src-tauri/src/lib.rs:470`) et les commandes utilisent `tauri::State<'_, ManagedCaptureProxyState>`.
- **Redémarrage du proxy possible** : `stop_capture_proxy` retire le drapeau avec `.take()`, ce qui permet à `start_capture_proxy` d'accepter un nouvel appel (sous réserve de la libération du port, voir issue 2).
- **Websocket manager managé** : Le `ConnectionManager` est également géré via `.manage()` (`src-tauri/src/lib.rs:469`) et correctement injecté dans les commandes websocket.

## Risques résiduels

- **CSP permissive** : Le champ `style-src 'self' 'unsafe-inline'` dans `tauri.conf.json` reste plus permissif que l'idéal, mais conformément au rapport initial, ce n'est pas bloquant car `script-src` reste strict.
- **Compilation non vérifiée** : `cargo check` n'a pas pu être exécuté jusqu'au bout en raison de l'absence de `pkg-config` / `glib-2.0` dans l'environnement de revue. L'erreur est purement environnementale (`error: failed to run custom build command for glib-sys`) et ne reflète pas une erreur de code en elle-même. Une vérification sur un environnement de build Tauri configuré est recommandée.
- **Utilisation du plugin fs côté frontend** : Le frontend utilise correctement `@tauri-apps/plugin-fs` et `@tauri-apps/plugin-dialog` dans `reqy-web/lib/utils.ts`, ce qui signifie que les permissions `fs:*` et `dialog:*` définies dans `default.json` sont pertinentes. Seule la commande `export_json` reste en dehors de ce périmètre.
