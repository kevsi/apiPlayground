# Plan d'amélioration UI — Page Settings

## Objectif
Transformer la page Settings de "fade" en une interface moderne, cohérente et agréable en utilisant le design system existant (shadcn/ui + Tailwind).

## Design System (existant)
- **Components** : `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `Collapsible`, `Accordion`, `Skeleton`, `Button`, `Input`, `Switch`, `Checkbox`, `Select`, `Dialog`
- **Couleurs** : Neutre / `primary` uniquement (pas de couleur par section)
- **Icônes** : Lucide React
- **Fond** : `bg-dot-pattern` déjà appliqué sur la page

---

## 1. Sidebar (settings/page.tsx)

### Avant
- Liste de boutons texte sans icônes
- Pas d'indicateur visuel de section active
- Apparence "brute"

### Après
- Chaque item a une **icône Lucide** à gauche
- L'item actif a :
  - Fond `bg-primary/10`
  - Texte `text-primary font-semibold`
  - **Barre verticale d'accent** à gauche (`before:` pseudo-element)
- Items inactifs : `hover:bg-muted`
- Transition fluide : `transition-all duration-150`
- Icônes par section :
  - profile → `User`
  - ai → `Sparkles`
  - notifications → `Bell`
  - sync → `Cloud`
  - integrations → `Plug`
  - account → `ShieldAlert`

---

## 2. Cartes unifiées (toutes les sections)

### Pattern Card standard
Chaque section est wrappée dans un `Card` shadcn avec :

```tsx
<Card>
  <CardHeader>
    <div className="flex items-start gap-4">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="size-5 text-primary" />
      </div>
      <div className="space-y-1">
        <CardTitle className="text-base">Titre de section</CardTitle>
        <CardDescription>Description courte.</CardDescription>
      </div>
    </div>
  </CardHeader>
  <CardContent className="space-y-5">
    {/* champs */}
  </CardContent>
  <CardFooter className="border-t pt-5">
    <Button>Action principale</Button>
  </CardFooter>
</Card>
```

### Sections impactées
- `ProfileSection`
- `AISection`
- `NotificationsSection`
- `SyncSection` (2 sous-sections → chacune devient une Card)
- `IntegrationsSection`
- `AccountSection`

---

## 3. Disclosure progressif

### AI Section (`ai-section.tsx`)
Utiliser `Collapsible` pour cacher/montrer les champs spécifiques au provider sélectionné :
- Par défaut visible : Provider Select + API Key + Modèle
- **Collapsible "Configuration avancée"** : Base URL + Quick Start (uniquement OpenAI)
- **Collapsible "Configuration Ollama"** : Host, Port, Model (uniquement quand provider = Ollama)

### Integrations Section (`integrations-section.tsx`)
- Chaque intégration (GitHub, Postman) devient une **sous-carte** distincte
- La zone de connexion (formulaire / clé API) est dans un `Collapsible` déclenché par un bouton "Configurer" ou automatiquement ouvert quand `disconnected`

### Account Section (`account-section.tsx`)
- Le formulaire de connexion (email/password + OAuth) est dans un `Collapsible` pour la zone "Non connecté"
- Le profil connecté est affiché en card distincte

---

## 4. États vides & Skeletons

### Skeleton pattern
```tsx
<div className="space-y-4">
  <Skeleton className="h-4 w-1/3" />
  <Skeleton className="h-8 w-full" />
  <Skeleton className="h-4 w-2/3" />
</div>
```

### Implémentation
- Chaque section accepte une prop `isLoading?: boolean` pour afficher des skeletons
- Les états vides (pas de connexion GitHub/Postman) utilisent le pattern :
  ```tsx
  <div className="flex flex-col items-center justify-center py-8 text-center">
    <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-muted">
      <Icon className="size-6 text-muted-foreground/40" />
    </div>
    <p className="text-sm text-muted-foreground">Aucune connexion active.</p>
  </div>
  ```

---

## 5. Chunks d'implémentation

### Chunk A — Sidebar + Layout global (`app/settings/page.tsx`)
**Fichier** : `reqy-web/app/settings/page.tsx`
**Complexité** : simple
**Tâches** :
1. Importer les nouvelles icônes Lucide (`User`, `Plug`, `ShieldAlert`, `Cloud`)
2. Transformer le mapping `SECTION_ITEMS` en tableau incluant `icon: LucideIcon`
3. Modifier le rendu nav avec icônes + barre active
4. Supprimer le header "Paramètres" général en tête de page (redondant avec les cards)
5. Garder la structure colonnes sidebar + contenu

### Chunk B — Sections simples (`profile-section.tsx` + `notifications-section.tsx` + `sync-section.tsx`)
**Fichier** : 3 fichiers
**Complexité** : simple
**Tâches** :
1. `ProfileSection` : wrapper Card, CardHeader avec icône User, CardContent, CardFooter avec bouton save
2. `NotificationsSection` : wrapper Card, CardHeader avec icône Bell, grouper les checkboxes dans des sous-cards visuelles (border-muted), CardFooter avec bouton test
3. `SyncSection` : chaque sous-section (Cloud Sync, Import/Export) devient une Card indépendante, garder le layout horizontal header

### Chunk C — AI Section (`ai-section.tsx`)
**Fichier** : `reqy-web/components/settings/ai-section.tsx`
**Complexité** : complexe (disclosure conditionnel)
**Tâches** :
1. Wrapper Card global
2. CardHeader avec Sparkles
3. Fields de base en CardContent (Provider, API Key, Model)
4. **`Collapsible` "Configuration avancée"** : contient Base URL + Quick Start, visible uniquement quand provider === "openai"
5. **`Collapsible` "Configuration Ollama"** : contient Host, Port, Model, visible uniquement quand provider === "ollama"
6. Conserver le Dialog de confirmation auto-apply
7. CardFooter avec bouton sauvegarder

### Chunk D — Integrations Section (`integrations-section.tsx`)
**Fichier** : `reqy-web/components/settings/integrations-section.tsx`
**Complexité** : complexe (2 sous-cartes + disclosure)
**Tâches** :
1. Wrapper Card global avec header Plug
2. **Card GitHub** : header avec logo, badge statut. Collapsible pour la zone connexion (ouvert par défaut si disconnected). Connected state affiche l'avatar + bouton déconnecter.
3. **Card Postman** : même pattern. Collapsible pour la zone connexion avec input clé API.
4. Améliorer l'état vide : icône + texte centré au lieu du simple `<p>`

### Chunk E — Account Section (`account-section.tsx`)
**Fichier** : `reqy-web/components/settings/account-section.tsx`
**Complexité** : simple
**Tâches** :
1. Wrapper Card global avec header ShieldAlert
2. **Sous-card Connexion** : header avec badge statut. Si connected → Card avec avatar + infos user. Si disconnected → Collapsible ouvert par défaut avec le formulaire email/password + boutons OAuth.
3. **Danger zone** : 2 cards distinctes (Désactiver / Supprimer) avec séparateur
4. CardFooter vide ou avec info

---

## 6. Vérification
- `pnpm tsc --noEmit` doit passer sans erreur
- Les sections doivent toutes avoir le même pattern Card
- La sidebar doit avoir l'indicateur actif visible
- Les Collapsible doivent fonctionner (ouvrir/fermer sans crash)
