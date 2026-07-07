# Intégration frontend (Next.js export statique, Vite, SvelteKit)

## Principe général

Tauri **ne supporte aucun frontend server-based en production**. Il charge des fichiers statiques (HTML/CSS/JS) via le protocole webview natif — pas de Node.js qui tourne dans le binaire final. Tout framework doit donc produire un export **statique** (SSG), jamais du SSR live.

Les 4 champs communs à configurer dans `src-tauri/tauri.conf.json` → objet `build` :

```json
{
  "build": {
    "beforeDevCommand": "<commande dev du frontend>",
    "beforeBuildCommand": "<commande build du frontend>",
    "devUrl": "http://localhost:<port>",
    "frontendDist": "../<dossier d'export>"
  }
}
```

- `devUrl` : où Tauri va chercher le frontend en mode `tauri dev` (le serveur dev du framework doit tourner sur cette URL).
- `frontendDist` : le dossier contenant les fichiers statiques buildés, utilisé pour `tauri build`.

⚠️ Vocabulaire v1 → v2 : `distDir`/`devPath` (v1) sont devenus `frontendDist`/`devUrl` (v2).

## Next.js (le cas de Reqly)

**next.config.js/mjs/ts** :

```js
const isProd = process.env.NODE_ENV === 'production';
const internalHost = process.env.TAURI_DEV_HOST || 'localhost';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',            // obligatoire : force le SSG, pas de serveur Node
  images: { unoptimized: true }, // next/image nécessite un serveur d'optimisation → désactivé
  assetPrefix: isProd ? undefined : `http://${internalHost}:3000`,
};

export default nextConfig;
```

**src-tauri/tauri.conf.json** :

```json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:3000",
    "frontendDist": "../out"
  }
}
```

**package.json** — s'assurer que le script `tauri` existe :

```json
{ "scripts": { "dev": "next dev", "build": "next build", "tauri": "tauri" } }
```

### Limitations concrètes de `output: 'export'` à connaître

- Pas de Server Actions, pas de routes API Next.js (`app/api/*`) actives en prod — tout ce qui doit s'exécuter côté "serveur" doit devenir une **command Tauri** en Rust.
- `next/image` doit passer par `unoptimized: true`, sinon l'export échoue ou les images cassent.
- Pas de rendu dynamique par requête (`getServerSideProps`, routes dynamiques non pré-générées sans `generateStaticParams`) — tout doit être pré-calculable au build.
- Exclure `src-tauri/` du `tsconfig.json` (`exclude`) pour éviter que Next.js/TypeScript scanne le code Rust.
- Sur mobile (iOS/Android), le dev server doit être accessible depuis l'IP interne du device, pas `localhost` — d'où la variable `TAURI_DEV_HOST`.

### Erreur de build fréquente : identifier par défaut

`tauri build` échoue en release si `identifier` dans `tauri.conf.json` est resté à la valeur par défaut (`com.tauri.dev` ou équivalent) — il faut le changer en un identifiant unique type reverse-DNS (`com.tondomaine.reqly`).

## Vite (React/Vue/Svelte génériques)

```ts
// vite.config.ts
export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: process.env.TAURI_DEV_HOST || 'localhost',
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
```

```json
{
  "build": {
    "beforeDevCommand": "npm run dev",
    "beforeBuildCommand": "npm run build",
    "devUrl": "http://localhost:5173",
    "frontendDist": "../dist"
  }
}
```

## SvelteKit

Nécessite l'adapter static (`@sveltejs/adapter-static`) + `ssr = false` dans `+layout.ts`, avec `fallback: 'index.html'` pour le routing côté client.

## Règle générale à appliquer à n'importe quel autre framework

1. Le framework doit pouvoir produire un dossier de fichiers 100% statiques (`export`, `generate`, `build` selon le framework).
2. Toute logique "serveur" (API routes, actions serveur, accès DB direct) doit être déplacée vers des **commands Rust** appelées via `invoke`.
3. Le dev server du framework doit rester joignable en HTTP local pendant `tauri dev` — Tauri ne fait qu'ouvrir une fenêtre pointant dessus, il ne le remplace pas.