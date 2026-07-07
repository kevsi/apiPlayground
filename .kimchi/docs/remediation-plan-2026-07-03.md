# Plan de remédiation — Reqly

> Basé sur le verdict d’audit du 2026-07-03  
> Objectif : lever le blocage critique au déploiement et traiter les risques résiduels

---

## 0. Résumé du verdict

**Verdict : GO conditionnel.**

Le code est buildable, typé et couvert par les tests unitaires. Le blocage unique au déploiement est la présence de **secrets de production dans l’historique git** (`reqy-web/.env.local`). Les autres risques sont connus, documentés et peuvent être traités de manière incrémentale.

---

## 1. Blocage critique — Secrets dans `.env.local`

### 1.1 Identifier l’étendue

Vérifier si `.env.local` a déjà été commité :

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
git log --all --full-history -- reqy-web/.env.local
# ou
 git log --all -p -- reqy-web/.env.local | head -100
```

Si la commande retourne des commits, le fichier est dans l’historique.

### 1.2 Choisir la méthode de purge

| Méthode | Quand l’utiliser | Commande |
|---|---|---|
| **A — Fichier jamais commité** | `.env.local` n’apparaît que dans le working tree | `git rm --cached reqy-web/.env.local` puis commit |
| **B — Fichier commité sur peu de commits** | Historique court, peu de branches | `git filter-repo --path reqy-web/.env.local --invert-paths` |
| **C — Historique complexe** | Plusieurs branches, collaborations, ou incertitude | [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) |

> **Recommandation :** utiliser BFG pour un historique dont on ne maîtrise pas toutes les branches.

### 1.3 Procédure recommandée avec BFG

```bash
# 1. Sauvegarder le .env.local actuel
cp reqy-web/.env.local /tmp/reqy-env-local.bak

# 2. Installer BFG (Java requis)
wget https://repo1.maven.org/maven2/com/madgag/bfg/1.14.0/bfg-1.14.0.jar -O /tmp/bfg.jar

# 3. Créer un mirror du repo
cd /tmp
git clone --mirror https://github.com/kevsi/apiPlayground.git reqly-mirror
cd reqly-mirror

# 4. Supprimer .env.local de tout l’historique
java -jar /tmp/bfg.jar --delete-files '.env.local'

# 5. Nettoyer et forcer la réécriture
git reflog expire --expire=now --all
git gc --prune=now --aggressive

# 6. Forcer le push (attention : irréversible)
git push --force

# 7. Revenir au repo local et réinitialiser
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main
git fetch origin --force
git reset --hard origin/master

# 8. Restaurer .env.local depuis la sauvegarde
cp /tmp/reqy-env-local.bak reqy-web/.env.local
```

### 1.4 Rotation des secrets

Après purge, **tous** les secrets doivent être considérés comme compromis et rotatés :

| Secret | Où le rotate |
|---|---|
| `GITHUB_OAUTH_CLIENT_ID` / `GITHUB_OAUTH_CLIENT_SECRET` | GitHub Settings → Developer settings → OAuth Apps |
| `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` | Google Cloud Console → APIs & Services → Credentials |
| `JINA_API_KEY` | Jina AI dashboard |
| `AUTH_SIGNING_SECRET` | Générer localement (`openssl rand -hex 32`) |
| `PROXY_SERVICE_TOKEN` | Générer par le launcher Tauri (`rand` 32+ bytes) |

### 1.5 Vérifier qu’aucun secret n’existe plus dans l’historique

```bash
git log --all -p | grep -E 'GITHUB_OAUTH_CLIENT_SECRET|GOOGLE_OAUTH_CLIENT_SECRET|JINA_API_KEY|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_ANON_KEY'
```

Si aucun résultat → purge réussie.

---

## 2. Risque élevé — Stockage des secrets côté client

### 2.1 Problème
`lib/secure-storage.ts` chiffre avec AES-256-GCM mais stocke **la passphrase et le ciphertext dans le même espace** (IndexedDB/localStorage). Un attaquant avec accès au profil navigateur peut déchiffrer offline.

### 2.2 Solution cible
Séparer la passphrase du ciphertext :

| Plateforme | Stockage de la passphrase |
|---|---|
| Desktop Tauri | Tauri Stronghold ou OS keychain (Keychain macOS, Credential Manager Windows, libsecret Linux) |
| Web pure | Impossible de garantir la séparation ; documenter la limitation |

### 2.3 Plan d’implémentation
1. Évaluer si `secure-storage.ts` est utilisé aujourd’hui pour des secrets réels (clés API) ou seulement pour des données sensibles locales.
2. Si desktop uniquement : implémenter un plugin Tauri de stockage sécurisé (`secure-storage` command) qui retourne la passphrase au frontend via IPC.
3. Si web également : conserver le chiffrement actuel et ajouter un avertissement utilisateur clair.
4. Ajouter des tests pour s’assurer qu’un ciphertext corrompu est rejeté.

**Acceptation :** la passphrase n’est plus lisible dans `localStorage` / IndexedDB sur desktop.

---

## 3. Risque moyen — Middleware Next.js 16 déprécié

### 3.1 Problème
Next.js 16 émet l’avertissement : `middleware` est déprécié, utiliser `proxy`.

### 3.2 Solution
Renommer `reqy-web/middleware.ts` → `reqy-web/proxy.ts` et importer depuis `next/proxy`.

### 3.3 Étapes
1. Renommer le fichier.
2. Remplacer `import { NextResponse, type NextRequest } from "next/server"` par `import { NextResponse, type NextRequest } from "next/proxy"`.
3. Renommer l’export `middleware` → `proxy`.
4. Mettre à jour `lib/__tests__/middleware-bearer.test.ts` (import dynamique).
5. Vérifier que `tsc --noEmit` et le build passent.
6. Mettre à jour `next.config.mjs` si nécessaire.

**Acceptation :** l’avertissement de dépréciation disparaît du build.

---

## 4. Risque moyen — CSP avec `unsafe-inline` / `unsafe-eval`

### 4.1 Problème
La CSP actuelle autorise les inline scripts et `eval`, ce qui affaiblit la protection XSS.

### 4.2 Solution cible
Générer des nonces côté serveur et les injecter dans les réponses.

### 4.3 Étapes
1. Créer un middleware/proxy qui génère un nonce par requête (`crypto.randomUUID()`).
2. Injecter le nonce dans le CSP (`script-src 'nonce-xxx'`).
3. Propager le nonce aux balises `<script>` inline de Next.js.
4. Conserver `unsafe-eval` si CodeMirror/GraphiQL en ont encore besoin ; sinon le retirer.
5. Pour le build desktop (`output: 'export'`), la CSP est dans `tauri.conf.json` ; elle peut rester stricte car le bundle est statique.

**Acceptation :** CSP en production sans `'unsafe-inline'` (ou avec une justification documentée si certains scripts en ont encore besoin).

---

## 5. Risque faible — Tests E2E skipped

### 5.1 État
8 tests sont en `skip` dans `tests/e2e/`.

### 5.2 Plan
1. Exécuter la suite Playwright sous Windows natif après réinstallation de `node_modules`.
2. Pour chaque test skipped :
   - Si la fonctionnalité existe et a des `data-testid` stables → le réactiver.
   - Si la fonctionnalité n’existe pas/plus → le supprimer ou le convertir en test futur.
   - Si les sélecteurs sont instables → ajouter des `data-testid` dans les composants.

### 5.3 Ordre de priorité
1. `api-request.spec.ts` (flux critique)
2. `graphql.spec.ts` / `graphql-dashboard.spec.ts`
3. `history.spec.ts`
4. `mock-server.spec.ts`, `variables.spec.ts`, `toasts.spec.ts`, `collections-to-editor.spec.ts` (features secondaires)

**Acceptation :** ≤ 2 tests skipped, et chaque skip justifié par un commentaire.

---

## 6. Vérifications finales

Après chaque phase de remédiation :

```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web

# 1. TypeScript
pnpm tsc --noEmit --pretty false

# 2. Tests unitaires
pnpm test

# 3. Build production
pnpm build

# 4. Lint
pnpm lint

# 5. E2E (Windows natif uniquement)
pnpm exec playwright install chromium
pnpm exec playwright test
```

---

## 7. Séquence recommandée

| Phase | Objectif | Livrable | Complexité |
|---|---|---|---|
| P1 | Purger `.env.local` de l’historique git | Historique propre, `.env.local` absent du git | simple |
| P2 | Rotation des secrets | Nouveaux credentials dans `.env.local` (non commité) | simple |
| P3 | Sécuriser le stockage client sur desktop | `lib/secure-storage.ts` utilise Tauri Stronghold/keychain | complexe |
| P4 | Renommer `middleware.ts` → `proxy.ts` | `proxy.ts` fonctionnel, build sans warning | simple |
| P5 | CSP basée sur des nonces | CSP en prod sans `unsafe-inline` | complexe |
| P6 | Stabiliser les tests E2E | ≤ 2 skips, suite verte sous Windows | moyenne |

---

## 8. Go/no-go post-remédiation

**GO inconditionnel** quand :
- [ ] `.env.local` purgé de l’historique git
- [ ] Tous les secrets rotatés
- [ ] `pnpm tsc --noEmit` passe
- [ ] `pnpm test` passe
- [ ] `pnpm build` passe
- [ ] `PROXY_SERVICE_TOKEN` configuré dans l’env de production

**GO avec réserves** si P3–P6 ne sont pas encore terminées, mais P1–P2 et les vérifications de build/test sont OK.
