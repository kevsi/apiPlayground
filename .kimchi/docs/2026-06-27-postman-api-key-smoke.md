# Postman API key integration — Smoke checklist

Run `cd reqy-web && npx next dev` then:

| # | Scenario | Expected | ✓ |
|---|----------|----------|---|
| M1 | Settings → Outils → click "Associer" sur Postman | Modal shows API key input (not OAuth redirect) | ☐ |
| M2 | Paste fake key "PMAK-fake-xxx" → "Valider et connecter" | Error inline "Clé rejetée par Postman", modal stays open | ☐ |
| M3 | Paste a real Postman API key → submit | Modal closes, card shows "Connecté" | ☐ |
| M4 | Click "Gérer" on Postman card (now connected) | Modal opens | ☐ |
| M5 | DevTools → Application → Cookies → `postman_api_key` is httpOnly | Yes | ☐ |
| M6 | Reload page → Postman card still shows "Connecté" | Yes (cookie persists) | ☐ |
| M7 | Logout from /api/auth/logout → Postman stays connected | Yes (different cookies) | ☐ |

## Verdict

- [ ] Tous les tests M1-M7 passent
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` aucune nouvelle erreur
