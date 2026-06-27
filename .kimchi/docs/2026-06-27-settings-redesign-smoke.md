````markdown
# Settings redesign — Smoke checklist

Run `cd reqy-web && npx next dev` then walk through these scenarios:

| # | Scenario | Expected | ✓ |
|---|----------|----------|---|
| M1 | Open `/settings` | Sidebar 7 sections, "Apparence" active par défaut | ☐ |
| M2 | Click "Profil & Sécurité" sidebar | Content swaps avec animation | ☐ |
| M3 | Apparence → card "Sombre" | Thème dark appliqué, reload conserve | ☐ |
| M4 | Apparence → cercle violet | Primary devient violet sur toute l'app | ☐ |
| M5 | Toggle Animations off → hover sidebar item | Aucune transition visible | ☐ |
| M6 | DevTools emulate `prefers-reduced-motion: reduce` + reload | Toggle Animations démarre à off | ☐ |
| M7 | Outils → click "Associer" sur carte GitHub | Modal s'ouvre avec scopes listés (repo read:user) | ☐ |
| M8 | Modal GitHub → click "Associer GitHub →" | Redirection vers `/api/github-auth` | ☐ |
| M9 | Outils → click "Associer" sur carte Linear | Toast "Bientôt disponible", modal ferme | ☐ |
| M10 | Refresh page avec accent + animations off en localStorage | Pas de flash, prefs appliquées avant premier paint | ☐ |

## Edge cases supplémentaires (optionnel)

| # | Cas | Comportement attendu | ✓ |
|---|-----|----------------------|---|
| E1 | User tape `#XYZ` dans l'input hex | Validation message inline, bouton "Appliquer" désactivé | ☐ |
| E2 | User tape `#FFF` (3 chars) | Rejeté par `HEX_REGEX`, message "Format hex invalide" | ☐ |
| E3 | Click "Plus de thèmes" → emerald | Thème switch, dropdown update | ☐ |
| E4 | Toggle sidebar collapse | Sidebar passe de 240px à 60px (et inversement) | ☐ |
| E5 | Section "Compte" click | Section vide ou message (la section destructive n'a pas de contenu en V1) | ☐ |

## Verdict

- [ ] Tous les tests M1-M10 passent
- [ ] Aucun edge case E1-E5 ne crashe l'app
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` aucune nouvelle erreur
````
