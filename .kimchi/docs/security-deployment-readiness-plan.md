# Plan de renforcement sécurité + préparation déploiement — reqly-web

> **Objectif :** passer de "build réussi + tests unitaires verts" à "prêt pour un déploiement sûr et confiance suffisante en l'absence de fuites de données sensibles".
>
> **Périmètre :** `reqy-web/` (Next.js sidecar). Le binaire Tauri (`src-tauri/`) est hors scope sauf pour les points liés au stockage desktop.
>
> **Critère de succès global :** `pnpm test` reste à 664/664 verts, `pnpm --dir reqy-web build` reste vert, et un rapport final documente chaque risque comme "corrigé", "accepté" ou "à traiter manuellement".

---

## Phase 1 — Durcissement des en-têtes de sécurité (CSP)

**Fichiers concernés :**
- Modifier : `reqy-web/next.config.mjs`
- Relire : `reqy-web/src-tauri/tauri.conf.json` (CSP côté desktop)

### 1.1 Auditer la CSP actuelle
La CSP actuelle contient :
```
script-src 'self' 'unsafe-inline' 'unsafe-eval'
```
Cela affaiblit la protection XSS. Le commentaire explique que c'est temporaire (dev + CM6/GraphiQL).

### 1.2 Proposer un durcissement progressif
- **Option A (recommandée) :** supprimer `'unsafe-inline'` en production en générant un nonce côté middleware pour les scripts Next.js, tout en gardant `'unsafe-eval'` si CodeMirror/GraphiQL en ont besoin.
- **Option B :** au minimum restreindre `connect-src` aux domaines réellement utilisés (au lieu de `https: wss:` tout-terrain).
- **Option C :** documenter l'acceptation du risque si le durcissement n'est pas faisable avant déploiement.

### 1.3 Vérification
- `pnpm --dir reqy-web build` réussit.
- Ouvrir l'application, vérifier dans les devtools que les onglets Runner / GraphQL / AI chargent sans erreur CSP.

---

## Phase 2 — Audit du stockage des secrets

**Fichiers concernés :**
- Relire : `reqy-web/lib/secure-storage.ts`
- Relire : `reqy-web/lib/config.ts`
- Relire : `reqy-web/lib/persistence.ts`

### 2.1 Vérifier ce qui est stocké où
| Secret | Où est-il stocké ? | Risque |
|---|---|---|
| Clés API AI (OpenAI, etc.) | `secureKeys` → chiffré AES-256-GCM, mais passphrase ET ciphertext dans le même stockage (IndexedDB + fallback localStorage) | Moyen : chiffrement empêche la lecture directe, mais passphrase locale = pas résistant à une attaque ciblée offline |
| Token GitHub | `secureKeys` (même mécanisme) | Idem |
| `PROXY_SERVICE_TOKEN` | `process.env` injecté par Tauri au spawn | Correct : jamais dans le bundle |
| `AUTH_SIGNING_SECRET` | `process.env` (utilisé seulement si `/login` réactivé) | Correct : pas dans le bundle |

### 2.2 Actions recommandées
- **2.2.1** Vérifier que `secure-storage.ts` ne loggue jamais la passphrase en clair (grep `console` dans le fichier — aujourd'hui propre).
- **2.2.2** Évaluer si le passphrase aléatoire généré (`crypto.randomUUID()`) doit être migré vers le Tauri secure store (`@tauri-apps/plugin-stronghold` ou OS keychain) pour desktop. Cela séparerait la passphrase du ciphertext.
- **2.2.3** S'assurer que `persistence.clear()` (appelée dans `secureKeys.clear()`) ne supprime pas accidentellement des données utilisateur non liées aux secrets.
- **2.2.4** Vérifier qu'aucune clé API n'est envoyée au serveur Next.js : la route `/api/proxy` a déjà un filtre `FORBIDDEN_FORWARDED_HEADERS` qui bloque `authorization` et `cookie` côté proxy.

### 2.3 Vérification
- Tests unitaires existants sur `secure-storage` doivent rester verts.
- Ajouter un test si nécessaire : "loadApiKey retourne '' si le ciphertext a été altéré".

---

## Phase 3 — Audit du filtrage des headers sensibles dans le proxy

**Fichiers concernés :**
- Relire : `reqy-web/app/api/proxy/route.ts`
- Relire : `reqy-web/app/api/proxy-ai/route.ts`
- Relire : `reqy-web/app/api/proxy-models/route.ts`

### 3.1 Vérifier la liste des headers interdits
La regex actuelle dans `proxy/route.ts` :
```ts
/^(cookie|authorization|proxy-authorization|proxy-authenticate|connection|keep-alive|te|trailers|transfer-encoding|upgrade)$/i
```
C'est correct. À vérifier que les deux autres routes proxy (`proxy-ai`, `proxy-models`) appliquent la même politique.

### 3.2 Vérifier les logs d'erreur
- `console.warn("[proxy] UPSTASH_REDIS_REST_URL not set...")` — acceptable, ne fuit pas de secret.
- S'assurer qu'aucun `console.error` dans les routes proxy n'imprime `headers`, `body` ou `payload` en cas d'erreur (grep `console` dans `app/api/**/route.ts`).

### 3.3 Vérification
- `pnpm vitest run lib/security/__tests__/ssrf.test.ts` reste vert.
- Si des écarts sont trouvés dans `proxy-ai` ou `proxy-models`, uniformiser le filtrage.

---

## Phase 4 — Complétude des routes protégées par le middleware

**Fichiers concernés :**
- Relire : `reqy-web/middleware.ts`
- Relire : `reqy-web/app/api/**/route.ts`

### 4.1 Lister toutes les routes API sensibles
Routes actuellement protégées :
- `/api/proxy/:path*`
- `/api/proxy-ai/:path*`
- `/api/proxy-models/:path*`
- `/api/test-runner/:path*`
- `/api/mock/:path*`

### 4.2 Vérifier qu'aucune route sensible n'est oubliée
Routes existantes à évaluer :
- `/api/github-auth/*` — authentification OAuth, devrait rester publique (callback).
- `/api/postman-auth/*` — idem.
- `/api/postman-import/*` — reçoit des collections, potentiellement sensible.
- `/api/github-import/*` — importe du code, potentiellement sensible.
- `/api/postman-export/*` — exporte des données.

### 4.3 Décision
- Si une route expose des données utilisateur ou effectue des actions (import/export), l'ajouter au `matcher` et à `PROTECTED_PREFIXES`.
- Documenter dans le code pourquoi chaque route publique est publique.

### 4.4 Vérification
- `pnpm vitest run lib/__tests__/middleware-bearer.test.ts` reste vert.
- Ajouter des tests pour chaque nouvelle route protégée.

---

## Phase 5 — Suppression des logs et données sensibles

**Fichiers concernés :**
- Tous les `app/api/**/route.ts`
- `reqy-web/lib/persistence.ts`
- `reqy-web/lib/secure-storage.ts`

### 5.1 Grep ciblé
Rechercher dans `reqy-web/` (hors tests) :
- `console.log|warn|error|info|debug` qui affichent des objets complets.
- `JSON.stringify(.*headers|.*request|.*response|.*body|.*token|.*key)`.
- Mots-clés : `token`, `key`, `secret`, `password` hors champs de formulaire.

### 5.2 Actions
- Remplacer les logs d'objets complets par des logs de contexte minimal (status, code erreur, URL non sensibles).
- Supprimer ou protéger le log `[persistence] Migrated ${entries.length} keys...` si `entries` pouvait contenir des clés sensibles (actuellement il ne log que le count, donc OK).

### 5.3 Vérification
- Relancer `grep` et confirmer qu'aucun log ne peut fuiter de secret.

---

## Phase 6 — Tests E2E et smoke tests manuels

**Fichiers concernés :**
- `reqy-web/playwright.config.ts`
- `reqy-web/tests/e2e/`

### 6.1 Lancer les tests E2E existants
```bash
cd /mnt/c/Users/alexanders/Documents/Workspace/apiPlayground-main/reqy-web
pnpm exec playwright test
```

### 6.2 Si Playwright échoue à cause de l'environnement
Noter les échecs comme "à traiter manuellement" dans le rapport final.

### 6.3 Checklist de smoke test manuel
Ouvrir l'app et vérifier :
- [ ] Runner HTTP : requête vers https://httpbin.org/get
- [ ] WebSocket : connexion + envoi message
- [ ] WebSocket Auth : Bearer + query param
- [ ] GraphQL : introspection + requête
- [ ] Mock server : création + appel
- [ ] AI : appel Ollama ou OpenAI (si clé configurée)
- [ ] Import Postman : upload + sauvegarde
- [ ] Collections : création + drag-and-drop
- [ ] Pas de flash blanc au chargement
- [ ] Pas d'erreur CSP dans la console navigateur

---

## Phase 7 — Gestion des avertissements de build

**Fichiers concernés :**
- `reqy-web/middleware.ts`
- `reqy-web/next.config.mjs`
- Variables d'environnement

### 7.1 Middleware déprécié
Next.js 16 affiche :
```
The "middleware" file convention is deprecated. Please use "proxy" instead.
```

**Option A :** migrer `middleware.ts` vers `proxy.ts` (Next.js 16 `next/proxy`).
**Option B :** accepter l'avertissement et planifier la migration avant la prochaine version majeure.

### 7.2 Rate limiter Redis
```
UPSTASH_REDIS_REST_URL not set — falling back to in-memory rate limiter
```

**Action :** documenter les variables requises pour la prod :
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `PROXY_SERVICE_TOKEN` (obligatoire, >= 32 caractères)
- `AUTH_SIGNING_SECRET` (si auth réactivée)

---

## Phase 8 — Rapport final de préparation déploiement

**Fichier à créer :**
- `docs/security-deployment-readiness-report.md`

### 8.1 Contenu du rapport
Pour chaque point ci-dessus :
- Statut : ✅ Corrigé / ⚠️ Accepté / ❌ À traiter manuellement
- Preuve (commande ou fichier modifié)
- Risque résiduel éventuel

### 8.2 Décision go/no-go
Le rapport conclura par l'une de ces trois options :
1. **GO** — déploiement possible avec les risques acceptés documentés.
2. **GO avec conditions** — déploiement possible après correction des points listés.
3. **NO-GO** — bloquages majeurs (sécurité ou build) à résoudre avant déploiement.

---

## Ordre d'exécution recommandé

1. **Phase 2** (stockage secrets) — impact sécurité maximal.
2. **Phase 3** (filtrage proxy) — rapide, haut impact.
3. **Phase 4** (routes protégées) — rapide, haut impact.
4. **Phase 5** (logs secrets) — rapide.
5. **Phase 1** (CSP) — peut casser l'UI, nécessite tests visuels.
6. **Phase 6** (E2E + smoke) — validation fonctionnelle.
7. **Phase 7** (warnings) — optionnel mais recommandé.
8. **Phase 8** (rapport final).

---

## Notes

- Chaque phase doit être implémentée par un Builder agent dédié.
- Avant chaque phase, mettre à jour le todo list.
- Après chaque phase, relancer `pnpm test` et `pnpm --dir reqy-web build` pour s'assurer qu'aucune régression n'est introduite.
