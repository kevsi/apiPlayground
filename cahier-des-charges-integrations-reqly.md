# Cahier des charges — Intégrations Reqly

Ce document spécifie les intégrations à développer pour Reqly, classées par priorité, avec pour chacune : l'objectif, les fonctionnalités attendues, les contraintes techniques, le coût réel, et les critères d'acceptation. Basé sur l'audit du marché des clients API (2026) et les points de douleur documentés spécifiquement pour le marché ouest-africain.

---

## Légende de priorité

| Niveau | Signification                                                      |
| ------ | ------------------------------------------------------------------ |
| P0     | Différenciateur fort, coût nul, à faire en premier                 |
| P1     | Différenciateur fort, effort modéré                                |
| P2     | Utile, mais dépend d'une décision produit ou d'un effort plus long |

---

## P0.1 — MCP server Reqly : mise en avant explicite

**Objectif** : transformer une fonctionnalité déjà construite mais peu visible (`start_mcp_server`, `sync_mcp_collections`) en argument marketing de premier plan, alors que la concurrence (Postman, Insomnia) commence tout juste à ajouter le support MCP en 2026.

**Fonctionnalités attendues :**

- Page de documentation dédiée expliquant comment connecter Reqly comme serveur MCP à Claude Desktop, Cursor, ou tout autre client MCP compatible
- Bouton "Copier la config MCP" dans les Settings, qui génère directement le bloc JSON à coller dans la config de l'agent IA cible
- Publication dans les registres/annuaires communautaires MCP existants

**Contraintes techniques :** aucune — le serveur MCP existe déjà et fonctionne (`mcp.rs`, port 3311 par défaut).

**Coût :** 0€. Travail de documentation et de packaging uniquement.

**Critères d'acceptation :**

- Un utilisateur peut copier une config MCP depuis Reqly et la coller dans Claude Desktop sans étape manuelle supplémentaire
- Le serveur MCP Reqly apparaît dans au moins un annuaire public de serveurs MCP

---

## P0.2 — Contract testing REST via extension du diff de schéma existant

**Objectif** : détecter automatiquement qu'un endpoint REST a changé de contrat entre deux moments, en réutilisant le mécanisme déjà construit pour GraphQL (`graphql-schema-diff.tsx`, snapshots + comparaison).

**Fonctionnalités attendues :**

- Extraire un schéma "effectif" d'un endpoint REST à partir de réponses observées (via l'historique existant ou une capture)
- Sauvegarder un snapshot nommé, comme c'est déjà fait pour GraphQL (`saveSnapshot`)
- Comparer un nouveau snapshot à un ancien et signaler les champs disparus, ajoutés, ou dont le type a changé

**Contraintes techniques :** nécessite une inférence de schéma JSON depuis des exemples de réponses (une librairie d'inférence JSON Schema suffit, pas besoin d'une vraie spec OpenAPI si elle n'existe pas).

**Coût :** 0€. Purement du code, aucune dépendance externe payante.

**Critères d'acceptation :**

- Un utilisateur peut sauvegarder un snapshot de la réponse d'un endpoint
- Une nouvelle exécution de la même requête, avec un champ en moins ou un type différent, déclenche un signalement clair du changement

---

## P0.3 — Tests auto-réparants pilotés par IA

**Objectif** : quand une assertion échoue dans le Runner suite à un changement d'API, proposer une correction plutôt que de simplement signaler l'échec — dans la lignée de ce que font Postman Postbot et Panto AI, mais en s'appuyant sur l'infrastructure IA déjà présente dans Reqly.

**Fonctionnalités attendues :**

- Quand un test échoue, bouton "Proposer une correction" qui appelle l'IA (réutilise `handleGenerateTests` existant) pour analyser la nouvelle réponse et suggérer une assertion corrigée
- Affichage en diff clair "assertion actuelle vs assertion proposée"
- **Jamais d'application automatique** — cohérent avec le paramètre `allowAutoApply` déjà en place, l'utilisateur valide toujours avant d'appliquer

**Contraintes techniques :** aucune nouvelle, réutilise l'IA déjà configurée par l'utilisateur (DeepSeek, etc.).

**Coût :** 0€ pour toi. Le coût des appels IA est déjà à la charge de l'utilisateur via sa propre clé/provider configuré.

**Critères d'acceptation :**

- Un test qui échoue propose une assertion corrigée en un clic
- Rien n'est modifié sans confirmation explicite de l'utilisateur

---

## P0.4 — Historique de run signé (hash) pour audit/conformité

**Objectif** : permettre de prouver qu'un rapport de run de collection n'a pas été modifié après coup — pertinent si Reqly vise des clients réglementés (fintech, banque).

**Fonctionnalités attendues :**

- Calcul d'un hash SHA-256 du rapport de run (`CollectionRunReport`) au moment de sa génération
- Horodatage et affichage du hash à côté du rapport, avec un moyen simple de le re-vérifier

**Contraintes techniques :** aucune, une fonction de hash standard suffit.

**Coût :** 0€.

**Critères d'acceptation :**

- Un rapport de run affiche son hash
- Modifier le rapport après coup change visiblement le hash recalculé

---

## P1.1 — Simulateur de callback Mobile Money (MTN MoMo / FedaPay / Kkiapay)

**Objectif** : résoudre un point de douleur massivement documenté par la communauté de développeurs MTN MoMo — le sandbox ne déclenche quasiment jamais le vrai callback, forçant les développeurs à deviner l'état d'une transaction ou à bricoler des solutions externes non fiables.

**Fonctionnalités attendues :**

1. **Templates de payloads pré-remplis par provider** (MTN MoMo Collections/Disbursement, FedaPay, Kkiapay) : boutons "Simuler succès", "Simuler échec", "Simuler timeout" avec le format exact de payload que chaque provider enverrait
2. **Guide d'utilisation d'un tunnel gratuit tiers** (voir P1.1-bis ci-dessous) pour permettre de recevoir un vrai callback en conditions de test, sans que Reqly héberge quoi que ce soit

**Contraintes techniques :**

- Les formats de payload par provider doivent être vérifiés contre la documentation officielle de chaque provider (les callbacks MTN MoMo notamment ont plusieurs variantes selon le produit — Collections vs Disbursement)
- Aucune infrastructure serveur à faire tourner côté Reqly

**Coût :** 0€. Uniquement du contenu statique (templates JSON) + de l'UI.

**Critères d'acceptation :**

- Un utilisateur peut simuler un callback MTN MoMo réussi/échoué sans quitter Reqly
- Le format du payload simulé correspond exactement à la documentation officielle du provider

---

## P1.1-bis — Facilitation d'un tunnel webhook gratuit (complément du point précédent)

**Objectif** : permettre de recevoir un vrai callback externe (MoMo ou autre webhook) sur sa machine locale, sans qu'aucune partie ne soit hébergée ou payée par Reqly.

**Fonctionnalités attendues :**

- Bouton "Créer un tunnel" qui détecte si `ngrok` est installé localement, propose l'installation sinon, et lance la commande pour l'utilisateur
- Alternative : intégration avec l'API gratuite de webhook.site pour une réception encore plus simple sans installation
- Champ générique "URL de callback" où coller n'importe quelle URL de tunnel — ne jamais coder en dur un seul fournisseur, pour ne pas dépendre des conditions d'un seul service tiers

**Contraintes techniques et choix d'architecture :**

- **Ne jamais héberger de relais soi-même** — chaque utilisateur utilise son propre compte gratuit (ngrok, Localtunnel, ou Cloudflare Tunnel)
- Recommandation de service par défaut : **Cloudflare Tunnel** pour un usage stable dans la durée (infrastructure pérenne, pas de risque de changement de conditions comme ça a pu arriver avec des tiers de modèles IA gratuits) ; **ngrok** accepté comme option rapide pour du prototypage ponctuel
- Reqly ne doit dépendre d'aucun de ces services pour fonctionner — ce sont des facilitateurs optionnels, pas des dépendances bloquantes

**Coût :** 0€, quelle que soit l'option choisie par l'utilisateur.

**Critères d'acceptation :**

- Un utilisateur sans compte ngrok préexistant peut en créer un et recevoir un callback de test en moins de 5 minutes depuis Reqly
- Aucune fonctionnalité de Reqly ne cesse de fonctionner si un service de tunnel change ses conditions gratuites (le champ URL reste générique)

---

## P1.2 — Capture-to-Test : générer une collection depuis une session de capture

**Objectif** : exploiter le proxy de capture déjà existant (`capture.rs`) pour générer automatiquement une collection de test à partir de trafic réel observé, dans la lignée du "traffic-based testing" identifié comme tendance de fond du secteur en 2026.

**Fonctionnalités attendues :**

- Bouton "Générer une collection depuis cette capture" après une session de capture de trafic
- Inférence automatique d'assertions de base (statut HTTP, présence des champs clés, type de chaque champ) à partir des réponses capturées
- Intégration avec l'IA existante pour proposer des assertions plus fines que la simple inférence de schéma

**Contraintes techniques :**

- Nécessite une librairie d'inférence de schéma JSON (pas de dépendance payante requise)
- Le proxy de capture existant doit être étendu pour conserver suffisamment de contexte (pas juste l'affichage en direct, mais un export structuré)

**Coût :** 0€.

**Critères d'acceptation :**

- Une session de capture de 10 requêtes produit une collection avec au moins une assertion de base par requête
- L'utilisateur peut éditer les assertions générées avant de les sauvegarder

---

## P1.3 — GitHub Actions : exécution de collection depuis la CI

**Objectif** : permettre de lancer un run de collection Reqly directement depuis un pipeline CI, comme le fait Newman pour Postman ou `bru run` pour Bruno.

**Fonctionnalités attendues :**

- CLI headless réutilisant la logique déjà présente dans `/api/test-runner/run`
- Action GitHub officielle packagée et publiée sur le Marketplace GitHub Actions
- Sortie au format JUnit XML (déjà supporté par la route existante via `?format=junit`)

**Contraintes techniques :** nécessite d'extraire la logique du test-runner dans un package utilisable en ligne de commande, indépendamment du serveur Next.js.

**Coût :** 0€ (hébergement sur le Marketplace GitHub gratuit pour un projet open source/public).

**Critères d'acceptation :**

- Une collection peut être exécutée depuis un workflow GitHub Actions et faire échouer le build si un test échoue
- Le rapport est lisible dans l'onglet Actions de GitHub (annotations ou artifact JUnit)

---

## P2.1 — Mode réseau contraint (simulation 2G/3G + coût data)

**Objectif** : afficher le coût réel en données (Mo/Ko) d'une requête/réponse et permettre de simuler une connexion lente, pertinent pour le développement d'apps ciblant des utilisateurs en connectivité intermittente (cohérent avec botwhasapp).

**Fonctionnalités attendues :**

- Affichage de la taille de payload en Ko/Mo (pas seulement en octets) sur chaque requête/réponse
- Estimation de coût data selon un profil d'opérateur (paramétrable)
- Throttling réseau intégré au Runner (pas seulement pour un onglet isolé)

**Contraintes techniques :** le throttling réseau doit être implémenté côté proxy Rust (limitation de bande passante) — plus de travail que les points précédents.

**Coût :** 0€, mais effort de développement plus long.

**Décision requise avant de lancer :** confirmer que c'est un axe voulu avant d'investir le temps, car l'effort est plus élevé que les autres points P0/P1.

---

## P2.2 — File d'attente "store-and-forward" pour requêtes en environnement déconnecté

**Objectif** : rendre Reqly lui-même résilient à une connexion intermittente (cohérent avec le contexte de travail de l'utilisateur), en mettant en file d'attente les requêtes qui échouent pour cause réseau et en les rejouant automatiquement à la reconnexion.

**Fonctionnalités attendues :**

- Détection de statut réseau fiable côté Tauri
- File d'attente locale (SQLite déjà en place) pour les requêtes échouées pour cause réseau uniquement (pas les erreurs applicatives)
- Rejeu automatique à la reconnexion, avec notification claire à l'utilisateur

**Contraintes techniques :** la détection fiable de "vraie coupure réseau" vs "erreur applicative" demande une logique un peu plus fine que d'habitude.

**Coût :** 0€.

**Décision requise avant de lancer :** confirmer la priorité par rapport aux autres points, car c'est un chantier de fond plutôt qu'une fonctionnalité isolée.

---

## P2.3 — Mode "non-développeur" (langage naturel guidé)

**Objectif** : ouvrir Reqly à des utilisateurs non-techniques (product managers, QA non-codeurs) pour la création de requêtes, dans la lignée de ce que propose l'outil émergent qAPI.

**Fonctionnalités attendues :**

- Mode simplifié qui masque les détails techniques et guide par des questions plutôt que des champs bruts
- Réutilise l'IA + function calling déjà construits

**Contraintes techniques :** aucune nouvelle techniquement, mais demande une vraie réflexion UX pour bien fonctionner.

**Coût :** 0€.

**Décision requise avant de lancer :** ça dépend d'un choix de positionnement produit (viser au-delà des devs purs ou rester focalisé développeurs) — à trancher avant d'investir dessus.

---

## P2.4 — Marketplace de templates localisés (Mobile Money, français, FCFA)

**Objectif** : bibliothèque de collections pré-construites en français avec des exemples réalistes pour les APIs les plus utilisées du marché ouest-africain.

**Fonctionnalités attendues :**

- Collections prêtes à l'emploi pour MTN MoMo, FedaPay, Kkiapay, Orange Money
- Documentation en français

**Contraintes techniques :** aucune, c'est principalement du contenu à créer.

**Coût :** 0€, seulement du temps de rédaction.

---

## Résumé — ordre d'exécution recommandé

| Ordre | Item                                               | Coût | Effort relatif                                              |
| ----- | -------------------------------------------------- | ---- | ----------------------------------------------------------- |
| 1     | P0.1 — MCP en avant                                | 0€   | Très faible                                                 |
| 2     | P0.2 — Contract testing REST                       | 0€   | Faible                                                      |
| 3     | P0.3 — Tests auto-réparants IA                     | 0€   | Faible                                                      |
| 4     | P0.4 — Historique de run signé                     | 0€   | Très faible                                                 |
| 5     | P1.1 + P1.1-bis — Simulateur MoMo + tunnel gratuit | 0€   | Modéré                                                      |
| 6     | P1.2 — Capture-to-Test                             | 0€   | Modéré                                                      |
| 7     | P1.3 — GitHub Actions CLI                          | 0€   | Modéré                                                      |
| 8     | P2.1 à P2.4                                        | 0€   | Plus élevé / nécessite une décision produit avant de lancer |

**Aucun de ces items ne demande de budget** — la seule vigilance nécessaire porte sur l'architecture du point P1.1-bis (tunnel) : toujours passer par un service gratuit tiers utilisé par chaque utilisateur, jamais par une infrastructure hébergée et payée par toi.
