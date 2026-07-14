# Icônes (lucide-react) + Toasts (sonner) — Reqly

## Icônes — lucide-react uniquement

**lucide-react est la SEULE librairie d'icônes du projet.** Un audit a confirmé l'absence de toute librairie concurrente (`react-icons`, `@tabler/icons`, `@radix-ui/react-icons`) — ne jamais en introduire une nouvelle, même pour une icône spécifique qui semblerait manquer dans lucide (lucide a un catalogue très large, chercher avant de conclure qu'une icône n'existe pas).

```tsx
import {
  Send,
  Brain,
  Wrench,
  FilePlus,
  Trash2,
  Play,
  Download,
  Upload,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
} from "lucide-react";
```

### Tailles

Un audit a noté des tailles d'icônes codées en dur de façon incohérente (`w-4 h-4`, `w-2.5 h-2.5` en classes directes sur chaque icône). Convention préférée : utiliser les tailles standards du projet plutôt que des valeurs arbitraires par composant :

- `size-3` (12px) — icônes inline dans du texte compact (badges, labels courts)
- `size-4` (16px) — taille par défaut pour la plupart des icônes UI (boutons, listes)
- `size-5` (20px) — icônes de mise en avant (cartes de statut, headers de section)

Éviter d'introduire de nouvelles tailles arbitraires (`w-4.5`, `w-3.5 h-3.5`) sans raison précise — rester sur l'échelle Tailwind standard.

### Pattern d'icône avec overlay de statut

Pattern déjà utilisé dans `AssistantStepsRenderer` (icône principale + petit indicateur de statut superposé) :

```tsx
<span className="relative flex items-center justify-center w-4 h-4 shrink-0">
  <Icon className="w-4 h-4 text-muted-foreground" />
  {status === "done" && (
    <CheckCircle2 className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 text-success bg-background rounded-full" />
  )}
</span>
```

## Toasts — sonner

Le système de notification transitoire (toast) utilise `sonner`. Pattern d'usage standard dans le projet :

```tsx
import { toast } from "sonner";

toast.success("Collection créée");
toast.error("Échec de la suppression");
toast("Message neutre");
```

**Attention à la distinction toast vs notification persistante** : le projet a AUSSI un système de notifications persistantes dans le store (`addNotification`, section notifications de l'app — cloche dans le header). Un toast disparaît après quelques secondes ; une notification persistante reste jusqu'à ce que l'utilisateur la marque comme lue ou la supprime. Pour toute action dont l'utilisateur DOIT avoir connaissance même s'il ne regarde pas l'écran au bon moment (ex: un blocage de sécurité, une erreur critique pendant une action IA), privilégier une notification persistante ET/OU un affichage direct dans le fil de conversation — pas seulement un toast qui peut disparaître avant d'être vu. C'est une leçon tirée d'un bug réel du projet (un message de blocage de sécurité qui n'atterrissait que dans un toast risquait de ne jamais être vu par l'utilisateur).

## Cohérence

Ne jamais mélanger une icône lucide et un caractère emoji pour représenter le même type de concept dans deux endroits différents de l'UI (ex: ✅ dans un endroit, `CheckCircle2` ailleurs pour la même signification) — choisir l'un ou l'autre par contexte et rester cohérent. Dans le pattern de feedback conversationnel de l'assistant IA (texte brut affiché dans le chat), les emojis (⏳✅❌⚠️) sont utilisés car ce sont des messages texte, pas des composants React — ne pas les mélanger avec de vraies icônes lucide dans le même bloc de rendu.
