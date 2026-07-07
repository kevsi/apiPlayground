# Rapport de conformité Tauri v2 — Reqly (apiPlayground-main)

## Résumé exécutif

**Verdict global : NON CONFORME** sur les points critiques de sécurité et de cycle de vie.

Le projet utilise correctement l'architecture Tauri v2 (core Rust + Next.js export statique, multi-fenêtre via webview natif), mais il présente **des écarts bloquants** qui empêcheront l'application de fonctionner correctement en runtime et des choix d'architecture qui contredisent les bonnes pratiques du skill Tauri v2.

---

## Écarts critiques (bloquants en runtime)

### 1. Commandes Rust non autorisées dans les capabilities

| Commande | Définie dans | Invoquée côté frontend | Permission `allow-*` présente |
|----------|--------------|------------------------|-------------------------------|
| `fetch_proxy` | `src-tauri/src/lib.rs:89` | Oui (via proxy / capture) | ❌ Non |
| `export_json` | `src-tauri/src/lib.rs:48` | Oui | ❌ Non |
| `open_external` | `src-tauri/src/lib.rs:64` | Oui | ❌ Non |
| `start_capture_proxy` | `src-tauri/src/lib.rs:419` | Oui | ❌ Non |
| `stop_capture_proxy` | `src-tauri/src/lib.rs:432` | Oui | ❌ Non |
| `ws_connect` | `src-tauri/src/websocket/commands.rs:14` | Oui | ❌ Non |
| `ws_send` | `src-tauri/src/websocket/commands.rs:137` | Oui (`use-websocket.ts:195`) | ❌ Non |
| `ws_disconnect` | `src-tauri/src/websocket/commands.rs:152` | Oui (`use-websocket.ts:215`) | ❌ Non |
| `ws_get_status` | `src-tauri/src/websocket/commands.rs:170` | Probablement | ❌ Non |

**Référence skill** : `capabilities-permissions.md` — *"Pour une commande définie dans `src-tauri/src/lib.rs` avec `#[tauri::command]`, Tauri génère automatiquement `allow-<nom_commande>`... il suffit généralement d'ajouter `allow-<nom_commande>` à la capability."*

**Conséquence** : Tous les appels `invoke(...)` vers ces commandes échoueront à l'exécution avec une erreur de type `Error: <command> not allowed`.

### 2. Plugins `dialog` et `fs` initialisés dans `.setup()` au lieu de `.plugin()`

Fichiers concernés :
- `src-tauri/src/lib.rs:459-460` : `tauri_plugin_deep_link::init()` et `tauri_plugin_notification::init()` correctement enregistrés sur le builder.
- `src-tauri/src/lib.rs:481-482` : `tauri_plugin_dialog::init()` et `tauri_plugin_fs::init()` appelés via `app.handle().plugin(...)` dans le hook `.setup()`.

**Référence skill** : `plugins-sidecar.md` — *"Deux étapes obligatoires et indépendantes pour qu'un plugin fonctionne : 1) `.plugin(tauri_plugin_x::init())` côté Rust..."* ; et `commands-ipc-state.md` — le builder est le lieu d'enregistrement des plugins.

**Conséquence** : Bien que les plugins fonctionnent partiellement quand ils sont ajoutés dans `.setup()`, ce n'est pas le pattern recommandé : les hooks internes, les événements et l'ordre d'initialisation ne sont pas garantis identiques. De plus, `export_json` n'utilise pas du tout le plugin `fs` : il utilise `std::fs::write`, ce qui contourne le système de permissions/scopes de Tauri.

---

## Écarts majeurs

### 3. Scope `fs` trop large

`src-tauri/capabilities/default.json:16-19` :
```json
{
  "identifier": "fs:scope",
  "allow": ["$APPDATA/**"]
}
```

**Référence skill** : `capabilities-permissions.md` — un scope doit cibler le sous-dossier de l'application (ex. `$APPDATA/Reqly/**` ou `$APPDATA/com.reqly.app/**`).

**Conséquence** : Le frontend (considéré non fiable) obtient un accès récursif en lecture/écriture sur tout le dossier `AppData` de l'utilisateur, ce qui élargit considérablement la surface d'attaque en cas de compromission du frontend.

### 4. State du proxy capturé via `OnceLock<Mutex<...>>` global

Fichier : `src-tauri/src/lib.rs:73-83` :
```rust
static CAPTURE_PROXY_STATE: OnceLock<Mutex<CaptureProxyState>> = OnceLock::new();
```

**Référence skill** : `commands-ipc-state.md` — *"Pour un état partagé... le pattern recommandé est `.manage(...)`... En dehors d'un contexte de command, utiliser `app_handle.state::<AppState>()` via le trait `Manager`."*

**Conséquence** : Le state n'est pas géré par le cycle de vie Tauri, n'est pas injectable dans les commandes, et la gestion du shutdown via `Ordering::Relaxed` + `get().map(...)` pour "vider" le `OnceLock` est fragile (un `OnceLock` ne peut pas être réinitialisé proprement).

### 5. Content Security Policy (CSP) permissive en production

`src-tauri/tauri.conf.json:17-23` :
```json
"csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ipc: http://ipc.localhost tauri: https://tauri.localhost; ..."
```

`script-src 'self'` est correctement strict (pas de `'unsafe-inline'`), mais `style-src 'self' 'unsafe-inline'` autorise les styles inline. Pour une application Next.js exportée statiquement, Tauri recommande un CSP nonce-based ou hash-based en production.

**Référence skill** : `capabilities-permissions.md` — *"Mettre `"csp": null` désactive complètement la CSP — à éviter en production."*

**Conséquence** : CSP moins restrictive que l'idéal ; cependant, ce n'est pas bloquant car `script-src` reste strict.

### 6. Gestion de l'arrêt du proxy capturé fragile

`src-tauri/src/lib.rs:432-445` (`stop_capture_proxy`) :
- Utilise `Ordering::Relaxed` pour un flag de shutdown partagé entre threads.
- Tente de "vider" un `OnceLock` via `get().map(|m| m.lock().map(|_| ()))`, ce qui ne réinitialise pas réellement le static.

**Conséquence** : Après avoir arrêté le proxy, `start_capture_proxy` retournera `"Capture proxy is already running"` car `CAPTURE_PROXY_STATE.get()` renverra toujours `Some`.

---

## Points positifs

| Point | Détail |
|-------|--------|
| Architecture Tauri v2 correcte | Utilisation de `tauri.conf.json` v2 (`frontendDist`, `devUrl`), pas de `distDir`/`devPath` v1. |
| Plugins core bien déclarés | `tauri-plugin-deep-link`, `tauri-plugin-notification`, `tauri-plugin-single-instance` initialisés sur le builder. |
| Sécurité `open_external` | Whitelist explicite `http`/`https`/`mailto`, bloquant les schémas dangereux (`file://`, `ms-settings:`, etc.). |
| Pas de CSP désactivée | La CSP est configurée, pas mise à `null`. |
| SSRF documenté | Le choix de ne pas bloquer localhost/LAN est justifié par un commentaire explicite (client API desktop). |
| Gestion des erreurs dans les commandes | Les commandes retournent `Result<T, String>` pour remonter proprement les erreurs au frontend. |

---

## Recommandations prioritaires

1. **Ajouter toutes les permissions `allow-*` manquantes** dans `src-tauri/capabilities/default.json` :
   ```json
   "permissions": [
     "core:default",
     "allow-fetch-proxy",
     "allow-export-json",
     "allow-open-external",
     "allow-start-capture-proxy",
     "allow-stop-capture-proxy",
     "allow-ws-connect",
     "allow-ws-send",
     "allow-ws-disconnect",
     "allow-ws-get-status",
     ...
   ]
   ```

2. **Initialiser `dialog` et `fs` sur le builder**, pas dans `.setup()` :
   ```rust
   builder
     .plugin(tauri_plugin_deep_link::init())
     .plugin(tauri_plugin_notification::init())
     .plugin(tauri_plugin_dialog::init())
     .plugin(tauri_plugin_fs::init())
     ...
   ```

3. **Restreindre le scope fs** à `$APPDATA/Reqly/**` ou `$APPDATA/com.reqly.app/**`.

4. **Remplacer le `OnceLock` global du proxy** par un state managé via `.manage(Arc<Mutex<CaptureProxyState>>)` et réinitialisable proprement.

5. **Corriger `stop_capture_proxy`** pour qu'il puisse être redémarré : utiliser un `Mutex<Option<...>>` managé ou un autre mécanisme permettant le remplacement de l'état.

6. **(Optionnel) Hardening CSP** : remplacer `'unsafe-inline'` pour `style-src` par un mécanisme hash/nonce si le build Next.js le permet.

---

## Conclusion

Le projet a une base Tauri v2 solide mais **ne fonctionnera pas correctement en l'état** à cause des commandes non autorisées dans les capabilities. Les problèmes de state global et d'initialisation des plugins sont des dettes techniques qui augmentent le risque de bugs de cycle de vie et réduisent la sécurité. Les corrections recommandées sont localisées et peuvent être appliquées sans refactorisation majeure.
