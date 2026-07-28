# ADR 001 — Modèle de menace pour le chiffrement IndexedDB de Reqly

> **Date** : 28 juillet 2026  
> **Statut** : Accepté  
> **Auteur** : Audit de sécurité Reqly

---

## Contexte

Reqly stocke des tokens API (OpenAI, Anthropic, etc.) et des secrets (clés OAuth, AUTH_SIGNING_SECRET) côté client. L'audit de sécurité a identifié que les credentials étaient accessibles en clair dans IndexedDB, rendant le stockage vulnérable à toute exécution de code arbitraire dans le renderer (XSS) ou à tout accès direct au filesystem local.

`lib/secure-storage.ts` contient déjà un chiffrement AES-256-GCM via `crypto.subtle`, mais la passphrase de déchiffrement est stockée dans le même stockage (localStorage + IndexedDB) que les données chiffrées — ce qui annule effectivement la protection du chiffrement.

## Décision menée

Il faut choisir un modèle où la **clé de déchiffrement est séparée** des **données chiffrées**. Deux options ont été évaluées :

### Option A : Secret de session Tauri (choisi)

- Le backend Tauri génère une passphrase aléatoire au démarrage et la stocke dans la mémoire du processus Rust.
- Cette passphrase est transmise au renderer par IPC (via une commande Tauri dédiée `getEncryptionPassphrase`) et n'est **jamais persistante**.
- Le renderer utilise cette passphrase pour chiffrer/déchiffrer les valeurs dans IndexedDB.
- **Protection** : XSS distant (ne peut pas lire la passphrase depuis le filesystem), accès filesystem local limité (la passphrase n'est pas sur le disque).
- **Faiblesse** : Ne protège pas contre un Tauri sidecar compromis, et ne résiste pas au redémarrage de l'app (les valeurs chiffrées redeviennent illisibles si la passphrase est perdue).
- **Friction UX** : Aucune — transparent pour l'utilisateur.

### Option B : Mot de passe utilisateur

- L'utilisateur fournit un mot de passe au lancement de Reqly.
- Ce mot de passe est passé à PBKDF2 pour dériver la clé de chiffrement.
- **Protection** : Résiste à un accès filesystem local (les données chiffrées ne sont lisibles qu'avec le mot de passe).
- **Faiblesse** : Ajoute une friction UX significative (déverrouillage à chaque lancement).

### Choix retenu : Option A (Secret de session Tauri)

**Justification** :

1. Reqly est un client API **desktop mono-utilisateur** (scope v1). La menace principale est un XSS dans le renderer (via une payload malveillante dans une réponse API), pas un attaquant physique accédant au filesystem.
2. L'option A fournit la meilleure protection sans friction UX, ce qui est critique pour un outil de productivité quotidien.
3. Le mot de passe (Option B) serait envisagé dans une future version si le scope s'élargit à un usage multi-utilisateur ou à des environnements partagés.

## Conséquences

- `secure-storage.ts` doit être mis à jour pour appeler une commande Tauri `getEncryptionPassphrase` au démarrage et stocker la passphrase en mémoire (pas sur le disque).
- La commande Tauri correspondante doit être ajoutée dans `src-tauri/src/store.rs` ou un nouveau module `crypto.rs`.
- Les tests doivent vérifier que la passphrase n'est jamais persistante sur le disque.
- Les valeurs chiffrées existantes (stockées avant cette ADR) doivent être migrées : au premier démarrage après la mise à jour, les valeurs en clair ou avec l'ancienne passphrase sont rechiffrées.
