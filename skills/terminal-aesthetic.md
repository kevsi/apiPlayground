# Esthétique "API client / terminal" — Reqly

Reqly se positionne comme un client API (concurrent de Postman/Bruno/Insomnia), avec une identité visuelle qui évoque un terminal / une console développeur plutôt qu'une app grand public.

## Barre d'URL — `.url-command`

La barre de saisie d'URL de requête adopte un style "commande shell" : fond distinct du reste de l'UI, police monospace (`font-mono`, Geist Mono — voir `typography-geist.md`), et généralement un préfixe visuel évoquant une invite de commande.

Pattern attendu :

```tsx
<div className="url-command flex items-center gap-2 rounded-md border border-input bg-input/30 px-3 font-mono text-sm">
  <MethodPill method="GET" />
  <input
    className="flex-1 bg-transparent outline-none"
    placeholder="https://api.example.com/users"
  />
</div>
```

## Pills de méthode HTTP — `.method-pill`

Chaque méthode HTTP a une couleur distincte, pensée via les tokens sémantiques quand elle représente un statut, mais pour l'identification de MÉTHODE (pas de statut de réponse), le projet utilise des couleurs fixes par convention (GET/POST/PUT/DELETE/PATCH ont chacune leur teinte dédiée dans plusieurs endroits du code — dashboard, documentation). Cette convention de couleur par méthode est différente de la convention de couleur par statut (succès/erreur/warning) — ne pas les confondre :

| Méthode | Couleur conventionnelle                  |
| ------- | ---------------------------------------- |
| GET     | success (vert) — lecture, non destructif |
| POST    | bleu — création, pas de token dédié      |
| PUT     | warning (amber) — remplacement           |
| PATCH   | violet — modification partielle          |
| DELETE  | destructive (rouge) — suppression        |

Cette convention de couleur par méthode est indépendante du token de statut HTTP de la réponse (2xx/4xx/5xx) — un GET qui échoue en 500 doit quand même afficher le pill "GET" en vert (couleur de méthode) tout en affichant le statut de réponse séparément en rouge (couleur de statut).

## Animations GPU

Le projet définit des animations custom nommées, pensées pour tourner sur GPU (transform/opacity plutôt que des propriétés qui déclenchent un reflow) :

| Animation        | Usage                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pulse-glow`     | Effet de halo pulsant, généralement pour indiquer une connexion active (WebSocket/SSE en cours)                                                                                                                                                                                                                                                                                                           |
| `send-pulse`     | Animation courte au moment de l'envoi d'une requête (feedback immédiat avant la réponse)                                                                                                                                                                                                                                                                                                                  |
| `skeleton-pulse` | Variante du pulse standard pour les placeholders de chargement — NE PAS confondre avec le composant `Skeleton` de shadcn qui utilise déjà `animate-pulse` de Tailwind ; `skeleton-pulse` est une animation custom nommée, à réserver aux cas où le rendu par défaut de `Skeleton` ne suffit pas visuellement (rare — vérifier si `<Skeleton>` seul ne suffit pas avant d'utiliser cette animation custom) |

**Toujours privilégier `transform`/`opacity` pour toute nouvelle animation custom** (pas de `width`/`height`/`top`/`left` animés directement) afin de rester cohérent avec l'intention GPU-friendly déjà présente dans le projet, et pour éviter le genre de problème de rendu/hit-test déjà rencontré avec `transition-all` sur des éléments interactifs (voir `variants-cn.md`).

## Cohérence terminal dans les nouveaux composants

Pour tout nouveau composant qui affiche du contenu technique (payload de requête, réponse, logs WebSocket/SSE, résultat de tool call IA) :

1. Police `font-mono` pour le contenu technique lui-même
2. Fond légèrement distinct (`bg-muted/30` typiquement) pour délimiter la zone "console" du reste de l'UI
3. Densité de ligne resserrée (peu d'espacement vertical) plutôt qu'aérée — cohérent avec le pattern déjà établi pour `AssistantStepsRenderer` (log dense façon Claude Code/OpenCode, pas des bulles de chat espacées)
