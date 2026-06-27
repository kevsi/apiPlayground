# Smoke test checklist — Externalize Auth UX

After running `cd reqy-web && npx next dev` and opening `http://localhost:3000`, walk through these 10 scenarios:

| # | Scénario | Étapes | Résultat attendu | ✓ |
|---|----------|--------|------------------|---|
| M1 | Premier lancement déconnecté | Lancer l'app, observer sidebar bottom | "Se connecter" visible, pas d'avatar | ☐ |
| M2 | Click "Se connecter" depuis /collections | Être sur /collections, cliquer | URL = `/login?redirect=%2Fcollections` | ☐ |
| M3 | Login email valide | Saisir credentials valides, submit | Redirect vers /collections, sidebar montre user | ☐ |
| M4 | Login email invalide | Saisir mauvais password | Toast d'erreur, formulaire reste, pas de redirect | ☐ |
| M5 | OAuth Google | Click "Continuer avec Google", valider sur Google | Retour sur /collections connecté | ☐ |
| M6 | Signup nouveau compte | /signup, saisir email nouveau + password | Toast succès + redirect ou demande vérif email | ☐ |
| M7 | Dropdown ouvert | Connecté, click sur avatar du sidebar | Dropdown avec nom, email, badge provider, 2 items | ☐ |
| M8 | Logout | Click "Se déconnecter" | Dropdown ferme, sidebar revient à "Se connecter", reload → toujours déconnecté. DevTools → Application → Cookies → `auth_session` absent | ☐ |
| M9 | Profil dans /settings | Connecté, /settings#profile | 5 sections visibles (overview, edit, password, security with badge "Bientôt", danger) | ☐ |
| M10 | Open redirect bloqué | /login?redirect=//evil.com, login valide | Redirect vers `/`, PAS vers evil.com | ☐ |

## Edge cases supplémentaires (optionnel)

| # | Cas | Comportement attendu |
|---|-----|----------------------|
| E1 | Double-click rapide sur "Se connecter" | Bouton désactivé pendant submit |
| E2 | Network coupé pendant login | Toast "Erreur réseau" |
| E3 | /login sans ?redirect= | Redirect vers `/` |
| E4 | /login?redirect=javascript:alert(1) | Redirect vers `/` (bloqué) |
| E5 | Supprimer le compte (zone dangereuse) | AlertDialog demande "SUPPRIMER" → toast "Fonctionnalité à venir" |

## Verdict

- [ ] Tous les tests M1-M10 passent
- [ ] Aucun edge case E1-E5 ne crashe l'app
- [ ] `pnpm test` exit 0
- [ ] `pnpm build` exit 0
