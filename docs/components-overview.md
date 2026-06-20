# Components Module — `reqy-web/components/`

## Purpose
React UI components for the Reqly desktop API client. Includes domain-specific panels, modals, and a library of reusable primitives from shadcn/ui.

## Component Groups

### Layout & Navigation
| Component | Purpose |
|-----------|---------|
| `api-sidebar.tsx` | Main sidebar with navigation tree, workspace selector, and collection list. |
| `collections-drawer.tsx` | Slide-out drawer for collection management. |
| `request-tab-bar.tsx` | Tab bar for open request tabs with close, reorder, dirty indicators. |
| `request-tabs-manager.tsx` | Orchestrates tab bar state and interactions. |
| `workspace-selector.tsx` | Dropdown for switching between workspaces. |

### Request Panel
| Component | Purpose |
|-----------|---------|
| `request-panel.tsx` | Main request editor — method, URL, headers, body, params. |
| `request-active-toolbar.tsx` | Toolbar with send, save, cancel buttons above request panel. |
| `response-panel.tsx` | Response display area — status, headers, body, timing. |
| `response-status-bar.tsx` | Status line showing HTTP status code, duration, size. |
| `response-headers-tab.tsx` | Tabular display of response headers. |
| `response-content-renderer.tsx` | Renders response body with syntax highlighting. |
| `response-code-snippet.tsx` | Generates code snippets from request/response. |
| `response-ai-summary.tsx` | AI-powered summary of the response. |
| `response-utils.ts` | Utility functions for response processing. |

### Mock Server
| Component | Purpose |
|-----------|---------|
| `route-panel.tsx` | Mock route editor — path pattern, method, response status/body/headers. |
| `route-modal.tsx` | Modal dialog for adding/editing a mock route. |
| `mock-route-editor.tsx` | Inline editor for route response configuration. |

### Collections & History
| Component | Purpose |
|-----------|---------|
| `collections-panel.tsx` | Side panel showing all collections with folders and requests. |
| `collections-folder-tree.tsx` | Tree view of collections with expand/collapse folders. |
| `collections-modal.tsx` | Modal for creating/editing collections. |
| `history-panel.tsx` | Request history list with filtering and search. |
| `variables-panel.tsx` | Environment variable editor panel. |

### Modals & Dialogs
| Component | Purpose |
|-----------|---------|
| `request-save-dialog.tsx` | Save confirmation dialog for unsaved requests. |
| `request-unsaved-close-dialog.tsx` | Warn before closing a tab with unsaved changes. |
| `request-chaining-dialog.tsx` | Configure request chaining (pipe response to next request). |
| `import-export-modal.tsx` | Import/export data in various formats. |
| `import-postman-modal.tsx` | Postman collection import wizard. |
| `import-openapi-modal.tsx` | OpenAPI spec import wizard. |
| `import-github-modal.tsx` | GitHub repository import dialog. |
| `export-postman-modal.tsx` | Export to Postman format. |
| `new-project-modal.tsx` | Create new project dialog. |
| `project-card.tsx` | Project summary card for dashboard. |

### Settings
| Component | Purpose |
|-----------|---------|
| `settings/account-section.tsx` | Account management (profile, password, delete). |
| `settings/profile-section.tsx` | User profile editor. |
| `settings/sync-section.tsx` | Sync configuration (cloud backup, cross-tab). |
| `settings/ai-section.tsx` | AI feature configuration. |
| `settings/integrations-section.tsx` | Third-party integrations (Postman, GitHub). |
| `settings/notifications-section.tsx` | Notification preferences. |

### Shared UI (shadcn/ui)
| File | Exports |
|------|---------|
| `ui/button.tsx` | `Button` component with variants. |
| `ui/input.tsx` | `Input` component. |
| `ui/dialog.tsx` | `Dialog`, `DialogTrigger`, `DialogContent`, etc. |
| `ui/select.tsx` | `Select`, `SelectTrigger`, `SelectContent`, etc. |
| `ui/table.tsx` | `Table`, `TableHeader`, `TableBody`, etc. |
| `ui/alert.tsx` | `Alert`, `AlertTitle`, `AlertDescription`. |
| `ui/tabs.tsx` | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`. |
| `ui/toast.tsx` | `Toast` and related components (wraps sonner). |
| `ui/badge.tsx` | `Badge` component. |
| `ui/card.tsx` | `Card`, `CardHeader`, `CardContent`, etc. |
| `ui/tooltip.tsx` | `TooltipProvider`, `Tooltip`, `TooltipTrigger`, `TooltipContent`. |
| (30+ more) | Full shadcn/ui library per components.json. |

### Utility Components
| Component | Purpose |
|-----------|---------|
| `error-boundary.tsx` | React error boundary with fallback UI. |
| `theme-provider.tsx` | Theme context provider (wraps next-themes). |
| `theme-switcher.tsx` | Light/dark/system theme toggle. |
| `batch-run-progress.tsx` | Progress indicator for batch request execution. |
| `floating-ai-chat.tsx` | AI assistant chat overlay. |
| `environment-selector.tsx` | Dropdown for active environment selection. |
| `message-actions.tsx` | Action buttons for AI-suggested changes. |
| `sync-status-banner.tsx` | Error banner when persistence sync fails. |

## Architecture
- **Domain components** (`request-panel`, `response-panel`, `route-panel`) consume hooks directly.
- **Shared UI** follows shadcn/ui conventions: atomic primitives with `cva` variant props and `cn` class merging.
- **Layout components** use `react-resizable-panels` for split-pane layouts.
- **Theme** is managed via `next-themes` with a custom `ThemeProvider`.

## Dependencies
- `lucide-react` — icons
- `recharts` — charts (dashboard)
- `sonner` — toast notifications
- `@radix-ui/*` — headless UI primitives
- `class-variance-authority` — component variants
- `tailwind-merge` — class name merging
