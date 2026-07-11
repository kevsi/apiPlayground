# AI Sidebar — Specification

## 1. Concept

Remplacer le `floating-ai-chat` (overlay flottant) par une **sidebar droite** persistante,
intégrée au layout principal, avec contrôle total de l'application via le chat IA.

L'IA n'agit **que sur demande explicite** de l'utilisateur (pas d'automatisme non sollicité).

---

## 2. Architecture

### 2.1 Layout (app/(app)/layout.tsx)

```
┌──────────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌────────────────────┐  ┌──────────────┐ │
│  │          │  │                    │  │              │ │
│  │ ApiSidebar│ │   Main Content     │  │  AI Sidebar  │ │
│  │ (gauche) │  │   (flex-1)         │  │  (droite)    │ │
│  │          │  │                    │  │              │ │
│  │          │  │  ┌──────────────┐  │  │ ─────────── │ │
│  │          │  │  │  ApiHeader   │  │  │ Header      │ │
│  │          │  │  ├──────────────┤  │  │ (titre +    │ │
│  │          │  │  │              │  │  │  close)     │ │
│  │          │  │  │   {children} │  │  │ ─────────── │ │
│  │          │  │  │              │  │  │ Messages    │ │
│  │          │  │  │              │  │  │ (scrollable)│ │
│  │          │  │  │              │  │  │             │ │
│  │          │  │  │              │  │  │ ─────────── │ │
│  │          │  │  │              │  │  │ Input       │ │
│  │          │  │  │              │  │  │ ─────────── │ │
│  │          │  │  │              │  │  │ Toolbar     │ │
│  └──────────┘  └────────────────────┘  └──────────────┘ │
└──────────────────────────────────────────────────────────┘
```

- **AiSidebar** à droite, dans le même `flex` que le layout
- Largeur **400px** par défaut, **resizable** (poignée de redimensionnement)
- **Toggle** : bouton "IA" dans l'ApiHeader ou raccourci clavier `Cmd+I`
- Cache la sidebar si l'IA n'est pas configurée (première utilisation)

### 2.2 Contextual Awareness

L'AI Sidebar connaît la **page active** via `usePathname()` et le **store Zustand** global.
Elle expose dans le contexte (`system prompt`) les informations pertinentes :

| Page               | Contexte transmis à l'IA                             |
| ------------------ | ---------------------------------------------------- |
| `/` (API Endpoint) | Requête en cours, réponse, variables d'environnement |
| `/collections`     | Collections list, collection active                  |
| `/my-projects`     | Projets list, projet sélectionné                     |
| `/workspaces`      | Workspaces list, workspace actif                     |
| `/settings`        | Config actuelle                                      |
| `/runner`          | Runner state                                         |
| `/websocket`       | WebSocket connection                                 |
| `/graphql`         | GraphQL schema, query                                |
| `/documentation`   | Docs content                                         |

---

## 3. Composants

### 3.1 `AiSidebar` (nouveau)

```
AiSidebar
├── AiSidebarHeader (titre "Assistant IA" + close/X)
├── AiSidebarMessages (zone scrollable)
│   ├── MessageBubble (user)
│   └── MessageBubble (assistant, avec boutons copy/retry)
├── AiSidebarInput (textarea + send)
└── AiSidebarToolbar (clear, export, settings link)
```

**Props** (via layout) : `open`, `onClose`, `width`, `onResize`

### 3.2 État local

```typescript
interface AiSidebarState {
  messages: ChatMessage[];
  input: string;
  isLoading: boolean;
  error: string | null;
  conversationHistory: ConversationSession[];
  currentSessionId: string | null;
}
```

### 3.3 Hooks réutilisés

- `useAIEngine()` — inchangé, fournit `sendMessage()`, `buildContext()`
- `useAiContext()` — inchangé, fournit le contexte de la page active
- `useAiChatHidden()` — renommé ou absorbé dans le store local

---

## 4. Actions IA

L'IA peut interagir avec l'application via les **stores Zustand** existants :

### 4.1 Requêtes HTTP

- Lire/modifier la requête courante : `useRequestStore().patchRequest()`
- Exécuter une requête : `useRequestStore().executeRequest()`
- Analyser une réponse : `useRequestStore().addAssertions()`

### 4.2 Collections

- Créer/éditer/supprimer : via store collections

### 4.3 Projets

- Ajouter/supprimer : `useRequestStore().addProject()`, `deleteProject()`

### 4.4 Workspaces

- CRUD via `useRequestStore()` (déjà connecté à l'API sync)

### 4.5 Variables d'environnement

- Lire/modifier : `useRequestStore().setVariable()`

Ces actions sont exposées via `AIEngineHandlers` (déjà défini dans `use-ai-engine.ts`).

---

## 5. Phases d'implémentation

### Phase 1 — Structure & Layout

1. Créer `AiSidebar` composant basique (vide, sans chat)
2. L'intégrer dans `app/(app)/layout.tsx`
3. Ajouter le toggle dans `ApiHeader`
4. Largeur par défaut 400px, resizable
5. Supprimer `floating-ai-chat`

### Phase 2 — Chat

1. Copier la logique chat de `floating-ai-chat.tsx` dans `AiSidebar`
2. Messages, input, envoi, historique
3. Contexte de page via `useAiContext()`

### Phase 3 — Actions

1. Connecter l'IA aux stores Zustand
2. `executeRequest`, `patchRequest`, CRUD collections/projets/workspaces
3. Feedback visuel des actions (ex: toast, highlight)

### Phase 4 — Polish

1. Auto-scroll, editing, retry (déjà existants dans floating-ai-chat)
2. Resize handler (drag)
3. Animation open/close
4. Responsive (mobile : drawer overlay au lieu de sidebar)

---

## 6. Questions ouvertes

1. **Historique des conversations** — On garde le localStorage comme aujourd'hui, ou on utilise IndexedDB (via `persistence`) ?

2. **Resizable** — Simple `useState` + `onMouseDown`/`onMouseMove`, ou librairie (`react-resizable-panels`) ?

3. **Toggle dans le header** — Plutôt un bouton dédié (icône `Bot`/`Sparkles`) ou intégré au bouton "IA" existant ?

4. **Mobile/responsive** — Sidebar devient un drawer (overlay) ? Ou on cache complètement ?

5. **Migration historique** — Les conversations du `floating-ai-chat` sont migrées automatiquement ?
