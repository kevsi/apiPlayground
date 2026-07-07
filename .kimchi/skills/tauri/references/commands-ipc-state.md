# Commands, IPC, State, Events (Tauri v2)

## Commands (Rust → appelable depuis JS)

```rust
// src-tauri/src/lib.rs
#[tauri::command]
async fn greet(name: String) -> Result<String, String> {
    Ok(format!("Hello, {}!", name))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

Côté frontend :

```ts
import { invoke } from "@tauri-apps/api/core";

const message = await invoke<string>("greet", { name: "Alex" });
```

Points d'attention :
- Le nom de la commande dans `invoke("...")` doit être en **snake_case exact** — une erreur fréquente est un mismatch entre le nom du champ côté Rust (struct/args) et celui envoyé côté JS (ex. `runnerAssertions` vs `assertions`) : Tauri fait une désérialisation Serde stricte, un nom de champ différent = erreur silencieuse ou `null`/valeur par défaut inattendue plutôt qu'un crash explicite. Toujours vérifier `#[serde(rename_all = "camelCase")]` si le frontend est en camelCase et le Rust en snake_case.
- Une commande doit être : (1) déclarée dans `generate_handler![...]`, ET (2) autorisée dans une capability (voir `capabilities-permissions.md`). Les deux sont indépendants.
- Les commandes async doivent retourner un `Result<T, E>` où `E: Serialize` pour que les erreurs remontent proprement au frontend (sinon `invoke` rejette une erreur générique peu utile).

## State management

```rust
use std::sync::Mutex;

struct AppState {
    counter: Mutex<u32>,
}

tauri::Builder::default()
    .manage(AppState { counter: Mutex::new(0) })
    .invoke_handler(tauri::generate_handler![increment]);

#[tauri::command]
fn increment(state: tauri::State<AppState>) -> u32 {
    let mut counter = state.counter.lock().unwrap();
    *counter += 1;
    *counter
}
```

- Piège classique : utiliser `State<'_, AppState>` au lieu de `State<'_, Mutex<AppState>>` (ou l'inverse selon comment tu as fait `.manage(...)`) — pas d'erreur de compilation, mais **panic au runtime** ("state not managed for field") car le type ne correspond à rien de managé.
- En dehors d'un contexte de command (ex. dans un thread, un event handler `on_window_event`, un callback de sidecar), utiliser `app_handle.state::<AppState>()` via le trait `Manager` plutôt que l'injection automatique.
- Pour un état partagé entre plusieurs fenêtres avec synchro temps réel (ex. settings), le pattern recommandé est : Rust = source de vérité unique, le frontend "pull" un snapshot au démarrage puis écoute un event d'invalidation plutôt que de dupliquer l'état de chaque côté.

## Events (communication async / broadcast)

```rust
// Rust → JS
app_handle.emit("progress", payload)?;               // broadcast à toutes les fenêtres
app_handle.emit_to("main", "progress", payload)?;     // fenêtre ciblée
```

```ts
// JS écoute
import { listen } from "@tauri-apps/api/event";
const unlisten = await listen<number>("progress", (event) => {
  console.log(event.payload);
});
```

Utiliser les **events** pour du flux continu/asynchrone (progression, logs de sidecar, notifications), et **commands + retour direct** pour du request/response classique. Pour du streaming avec progression fine dans une commande, `Channel<T>` (API `@tauri-apps/api/core`) est l'outil dédié — plus adapté qu'une commande qui bloque jusqu'à la fin.

## Fenêtres multiples

- Créer via config (`tauri.conf.json` → `app.windows[]`) au démarrage, ou dynamiquement en Rust/JS (`WebviewWindowBuilder`).
- Chaque fenêtre a un `label` unique — **c'est le label, pas le titre affiché, qui sert de frontière de sécurité** dans les capabilities.
- Isoler les fenêtres à privilège différent (ex. fenêtre principale vs fenêtre "à propos") avec des capabilities séparées réduit l'impact d'une éventuelle vulnérabilité frontend.

## Lifecycle hooks utiles

```rust
tauri::Builder::default()
    .setup(|app| {
        // init au démarrage, accès à AppHandle
        Ok(())
    })
    .build(tauri::generate_context!())?
    .run(|_app_handle, event| {
        if let tauri::RunEvent::ExitRequested { api, .. } = event {
            // logique avant fermeture complète (ex. sauvegarder l'état)
        }
    });
```