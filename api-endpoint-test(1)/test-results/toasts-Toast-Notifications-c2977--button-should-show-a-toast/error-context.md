# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: toasts.spec.ts >> Toast Notifications >> Settings - Tester un toast button should show a toast
- Location: tests\e2e\toasts.spec.ts:4:7

# Error details

```
TimeoutError: locator.click: Timeout 10000ms exceeded.
Call log:
  - waiting for getByText('Tester un toast', { exact: true })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - button "Open Next.js Dev Tools" [ref=e7] [cursor=pointer]:
    - img [ref=e8]
  - alert [ref=e11]
  - generic [ref=e12]:
    - complementary [ref=e13]:
      - generic [ref=e14]:
        - img [ref=e16]
        - generic [ref=e18]:
          - generic [ref=e19]: Zendeeps Space
          - generic [ref=e20]: Pro | 12 Members
        - img [ref=e21]
      - navigation [ref=e23]:
        - list [ref=e24]:
          - listitem [ref=e25]:
            - link "Dashboard" [ref=e26] [cursor=pointer]:
              - /url: /dashboard
              - img [ref=e27]
              - generic [ref=e32]: Dashboard
          - listitem [ref=e33]:
            - link "API Endpoints" [ref=e34] [cursor=pointer]:
              - /url: /
              - img [ref=e35]
              - generic [ref=e37]: API Endpoints
          - listitem [ref=e38]:
            - link "Collections" [ref=e39] [cursor=pointer]:
              - /url: /collections
              - img [ref=e40]
              - generic [ref=e42]: Collections
          - listitem [ref=e43]:
            - link "Projects" [ref=e44] [cursor=pointer]:
              - /url: /my-projects
              - img [ref=e45]
              - generic [ref=e49]: Projects
          - listitem [ref=e50]:
            - link "AI Assistant" [ref=e51] [cursor=pointer]:
              - /url: /ai-insights
              - img [ref=e52]
              - generic [ref=e55]: AI Assistant
          - listitem [ref=e56]:
            - link "Documentation" [ref=e57] [cursor=pointer]:
              - /url: /documentation
              - img [ref=e58]
              - generic [ref=e61]: Documentation
          - listitem [ref=e62]:
            - link "Settings" [ref=e63] [cursor=pointer]:
              - /url: /settings
              - img [ref=e64]
              - generic [ref=e67]: Settings
      - link "Ask Monu AI" [ref=e69] [cursor=pointer]:
        - /url: /ai-insights
        - img [ref=e71]
        - generic [ref=e74]: Ask Monu AI
      - generic [ref=e77]:
        - img "Nurul" [ref=e79]
        - generic [ref=e80]:
          - generic [ref=e81]: Nurul's Zone
          - generic [ref=e82]: nurul@zendeeps.com
        - img [ref=e83]
      - button "Collapse sidebar" [ref=e85]:
        - img [ref=e86]
    - generic [ref=e89]:
      - banner [ref=e90]:
        - generic [ref=e94]:
          - generic [ref=e95]:
            - img [ref=e96]
            - textbox "Search APIs, endpoints, logs..." [ref=e99]
          - button "Global" [ref=e100]:
            - text: Global
            - img
          - button [ref=e102]:
            - img [ref=e103]
          - button [ref=e108]:
            - img [ref=e109]
      - generic [ref=e112]:
        - generic [ref=e114]:
          - generic [ref=e115]:
            - paragraph [ref=e116]: Paramètres
            - heading "Configuration de l'application" [level=1] [ref=e117]
            - paragraph [ref=e118]: Gérez l'assistant IA, les notifications et la synchronisation d'équipe.
          - generic [ref=e119]:
            - button "Enregistrer les paramètres" [ref=e120]
            - button "Recharger" [ref=e121]
        - generic [ref=e122]:
          - complementary [ref=e123]:
            - navigation [ref=e124]:
              - button "Profil & Sécurité" [ref=e125]
              - button "Assistant IA" [ref=e126]
              - button "Notifications" [ref=e127]
              - button "Import / Export" [ref=e128]
              - button "Actions du compte" [ref=e129]
          - generic [ref=e131]:
            - generic [ref=e132]:
              - img [ref=e134]
              - generic [ref=e137]:
                - heading "Sécurité" [level=2] [ref=e138]
                - paragraph [ref=e139]: Informations du compte et options de sécurité.
            - generic [ref=e140]:
              - generic [ref=e141]:
                - generic [ref=e142]: Adresse email
                - textbox "Non renseigné" [ref=e143]
                - paragraph [ref=e144]: L'email associé au compte (local).
              - generic [ref=e145]:
                - generic [ref=e146]:
                  - paragraph [ref=e147]: Vérification en deux étapes
                  - paragraph [ref=e148]: Renforce la sécurité du compte.
                - generic [ref=e149]:
                  - generic [ref=e150]: Désactivée
                  - button "Activer" [ref=e151]
              - generic [ref=e152]:
                - button "Enregistrer profil" [ref=e153]
                - generic [ref=e154]: Paramètres personnels
  - button "Ask AI" [ref=e155]:
    - img [ref=e156]
    - generic [ref=e159]: Ask AI
  - dialog "Monu IA mini-chat":
    - generic:
      - generic:
        - generic:
          - img
        - generic:
          - paragraph: Monu IA
          - paragraph: Assistant IA disponible
      - generic:
        - generic: Paramètres
        - button "Fermer":
          - img
  - region "Notifications (F8)":
    - list
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test'
  2  | 
  3  | test.describe('Toast Notifications', () => {
  4  |   test('Settings - Tester un toast button should show a toast', async ({ page }) => {
  5  |     // Navigate to settings
  6  |     await page.goto('/settings')
  7  |     
  8  |     // Click on the Notifications menu item
  9  |     await page.getByText('Notifications', { exact: true }).click()
  10 |     
  11 |     // Find and click the "Tester un toast" button
  12 |     const testToastButton = page.getByText('Tester un toast', { exact: true })
> 13 |     await testToastButton.click()
     |                           ^ TimeoutError: locator.click: Timeout 10000ms exceeded.
  14 |     
  15 |     // Check if the toast is visible
  16 |     const toast = page.locator('.group.toast') // shadcn/ui toast usually has these classes, or we can look by text
  17 |     await expect(page.getByText('Test de notification (toast)')).toBeVisible()
  18 |   })
  19 | 
  20 |   // test('Collections - Creating a collection should show a toast', async ({ page }) => {
  21 |   //  ...
  22 |   // })
  23 | })
  24 | 
```