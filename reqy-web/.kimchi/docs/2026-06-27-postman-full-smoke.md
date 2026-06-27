# Postman full integration — Smoke checklist

Run `cd reqy-web && npx next dev` then:

| # | Scenario | Expected | ✓ |
|---|----------|----------|---|
| M1 | Connecter Postman avec vraie clé | Card passe à "Connecté" IMMÉDIATEMENT (pas besoin de naviguer ailleurs) | ☐ |
| M2 | Click "Gérer" sur la card Postman | `PostmanManageModal` s'ouvre, liste les collections depuis Postman | ☐ |
| M3 | Click "Importer" sur une collection | `PostmanImportModal` s'ouvre avec aperçu des 3 premières routes | ☐ |
| M4 | Click "Confirmer" dans `PostmanImportModal` | Toast "Importé (N routes)", modal ferme | ☐ |
| M5 | Va sur `/collections` — la nouvelle collection apparaît | Oui, avec toutes les routes | ☐ |
| M6 | Click "Importer toutes" dans `PostmanManageModal` | Progress visible `[N/total]`, toast récap à la fin | ☐ |
| M7 | Click "Déconnecter" dans `PostmanManageModal` | Modal ferme, card repasse à "Non connecté" | ☐ |
| M8 | Vérifier headers v10 : `curl -i -H "Cookie: postman_api_key=..." http://localhost:3000/api/postman-auth/collections` | Réponse 200 (pas 401) | ☐ |

## Verdict

- [ ] Tous les tests M1-M8 passent
- [ ] `npx vitest run` exit 0
- [ ] `npx tsc --noEmit` aucune nouvelle erreur
- [ ] Aucun `fetch(` direct dans les routes Postman (cf. `grep` P10.3)
- [ ] Aucune référence à `api.getpostman.com` (cf. `grep` P10.4)
