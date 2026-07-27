# Procédure de déploiement — Reqly (100% gratuit)

## Architecture

```
Navigateur
    │
    ├── https://reqly.vercel.app    ──►  Frontend Next.js (Vercel Free)
    │                                     │
    │                                     │  API routes (auth OAuth, proxy,
    │                                     │  SDK generation, etc.)
    │                                     │
    └── https://reqly-sync.fly.dev   ──►  Sync-server Hono + SQLite (Fly.io Free)
                                            │
                                            ├── Auth (signup/login/verify)
                                            ├── Sync (push/poll collections)
                                            └── WebSocket (live updates)
```

**Coût : 0 €/mois.** Deux services gratuits qui se parlent.

---

## 1. Sync-server (auth + sync + WebSocket) — Fly.io Free

Fly.io offre **3 VMs gratuites** + **3GB de stockage persistant** — parfait pour
le sync-server et sa base SQLite.

### Créer le compte

```bash
# Installer flyctl
iwr https://fly.io/install.ps1 -useb | iex   # Windows
# OU
curl -L https://fly.io/install.sh | sh        # Linux/Mac

# Créer un compte (carte bancaire demandée mais gratuite)
fly auth signup
```

### Configurer et déployer

Le fichier `sync-server/fly.toml` est déjà prêt dans le projet.

```bash
cd sync-server

# Lancer le déploiement
fly launch --no-deploy   # prépare la config, ne déploie pas encore

# Ajouter les secrets (variables sensibles)
fly secrets set AUTH_SIGNING_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
fly secrets set ALLOWED_ORIGIN=https://reqly.vercel.app

# Créer le volume persistant pour la base SQLite
fly volumes create reqly_data --region cdg --size 1

# Configurer SMTP (optionnel mais recommandé pour les emails de vérification)
fly secrets set EMAIL_PROVIDER=log               # ← mode "log" = pas d'email,
                                                  #   les codes sont dans les logs
# OU pour envoyer de vrais emails :
# fly secrets set EMAIL_PROVIDER=smtp EMAIL_FROM=noreply@domaine.com
# fly secrets set SMTP_HOST=... SMTP_PORT=587 SMTP_USER=... SMTP_PASS=...

# Déployer
fly deploy
```

### Vérifier

```bash
curl https://reqly-sync.fly.dev/api/health
# → { "ok": true }

# Voir les logs (utile pour récupérer les codes de vérification en mode dev)
fly logs
```

---

## 2. Frontend (Next.js) — Vercel Free

### Option A : Déploiement GitHub (le plus simple)

1. Aller sur [vercel.com](https://vercel.com) → Sign up with GitHub
2. Cliquer **Add New → Project**
3. Importer le dépôt GitHub du projet
4. Configurer :
   - **Root Directory :** `reqy-web`
   - **Build Command :** `next build --webpack`
   - **Output Directory :** `.next`
5. Ajouter les variables d'environnement (section ci-dessous)
6. Déployer

### Option B : Via CLI

```bash
npm i -g vercel
cd reqy-web
vercel --prod
```

### Variables d'environnement (Vercel → Settings → Environment Variables)

```env
# ── Obligatoires ──────────────────────────────────────────────
NEXT_PUBLIC_APP_URL=https://reqly.vercel.app
NEXT_PUBLIC_SYNC_URL=https://reqly-sync.fly.dev
AUTH_SIGNING_SECRET=<même_que_le_sync_server>

# ── OAuth (optionnel) ─────────────────────────────────────────
# GitHub, GitLab, Google, Postman — seulement si tu veux
# les imports OAuth. Sinon, laisser vide, ça marche sans.
GITHUB_OAUTH_CLIENT_ID=
GITHUB_OAUTH_CLIENT_SECRET=
GITLAB_OAUTH_CLIENT_ID=
GITLAB_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
POSTMAN_CLIENT_ID=
POSTMAN_CLIENT_SECRET=

# ── AI / Autres (optionnel) ──────────────────────────────────
JINA_API_KEY=
ALLOW_LOCAL_HOSTS=false
```

---

## 3. SMTP Gratuit (optionnel)

Par défaut (`EMAIL_PROVIDER=log`), les codes de vérification sont écrits dans les logs
Fly.io. Tu peux les voir avec `fly logs`.

Pour envoyer de **vrais emails** gratuitement :

### SendGrid (100 emails/jour gratuits)

```bash
# 1. Créer compte SendGrid
# 2. Créer une clé API
# 3. Configurer sur Fly.io :
fly secrets set EMAIL_PROVIDER=smtp
fly secrets set EMAIL_FROM=noreply@votredomaine.com
fly secrets set SMTP_HOST=smtp.sendgrid.net
fly secrets set SMTP_PORT=587
fly secrets set SMTP_USER=apikey
fly secrets set SMTP_PASS=<votre_clé_api_sendgrid>
```

### Resend (100 emails/jour gratuits)

```bash
fly secrets set EMAIL_PROVIDER=resend
fly secrets set RESEND_API_KEY=re_...
fly secrets set EMAIL_FROM=noreply@votredomaine.com
```

---

## 4. Instructions pas à pas (si tu pars de zéro)

### Jour 1 — Déployer le sync-server (15 min)

```bash
# 1. Installer flyctl
# 2. Créer compte Fly.io
fly auth signup

# 3. Déployer le sync-server
cd sync-server
fly launch --generate-name --no-deploy
fly secrets set AUTH_SIGNING_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
fly secrets set ALLOWED_ORIGIN=https://reqly.vercel.app
fly secrets set EMAIL_PROVIDER=log
fly volumes create reqly_data --region cdg --size 1
fly deploy

# 4. Noter l'URL du sync-server
# → https://reqly-sync.fly.dev
fly info
```

### Jour 2 — Déployer le frontend (10 min)

```bash
# 1. Aller sur vercel.com
# 2. Importer le dépôt GitHub
# 3. Root directory = reqy-web
# 4. Ajouter env vars :
#    NEXT_PUBLIC_SYNC_URL = https://reqly-sync.fly.dev
#    NEXT_PUBLIC_APP_URL = https://reqly.vercel.app
#    AUTH_SIGNING_SECRET = <même valeur que sur Fly.io>
# 5. Déployer
```

### Jour 2+ — Tester

- Aller sur `https://reqly.vercel.app/signup`
- Créer un compte
- Voir le code de vérification : `fly logs | grep code`
- Se connecter, créer une collection
- Ça marche ✅

---

## 5. Checklist finale

- [ ] `fly deploy` passe sans erreur
- [ ] `https://reqly-sync.fly.dev/api/health` répond `{ "ok": true }`
- [ ] Vercel build passe
- [ ] `AUTH_SIGNING_SECRET` identique sur les deux
- [ ] Création de compte fonctionne
- [ ] Login + session persistent (F5 ne déconnecte pas)
- [ ] Sync entre deux onglets fonctionne

---

## 6. Budget : 0 €/mois

| Service       | Usage                                | Coût    |
| ------------- | ------------------------------------ | ------- |
| Vercel Free   | Frontend Next.js                     | **0 €** |
| Fly.io Free   | Sync-server (VM + 3GB storage + SSL) | **0 €** |
| SendGrid Free | 100 emails/jour                      | **0 €** |
| Domaine       | *.vercel.app ou *.fly.dev gratuit    | **0 €** |
| **Total**     |                                      | **0 €** |
