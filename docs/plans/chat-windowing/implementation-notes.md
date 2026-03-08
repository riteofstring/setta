# Chat Windowing Implementation Notes

Date: 2026-03-05
Branch baseline: `8037bd0bb`

## Intentional Break: No Legacy Section-Chat Migration

Chat windowing v1 intentionally does not preserve the old pane-embedded
section-chat compatibility model.

This is a deliberate product/architecture decision from
`docs/plans/chat-windowing/plan.md`:

- Project chat is window-managed from the bottom dock/floating/maximized
  surfaces instead of rendering directly inside the overview pane.
- Section chat and project chat now share one unified chat surface, with
  `section_mode` and `project_ai_mode` selected by host + section settings.
- Old section-chat migration shims, left-pane chat compatibility, and legacy
  layout fallbacks are out of scope for v1.

## What Is Not Preserved

- The overview pane is no longer the source of truth for the live project chat
  surface. It now hosts the project chat manager and state controls.
- Section chat does not keep a separate legacy implementation path alongside
  the unified chat surface.
- Legacy assumptions that section chat settings are available inline in every
  rendering host are no longer valid. In section rendering, settings are owned
  by the right pane.
- Runtime window placement/geometry/minimize/maximize state is not migrated
  from old local UI assumptions. The v1 source of truth is the DB-backed
  project chat windowing state.

## Source-of-Truth Code Paths

- Unified chat host routing: `frontend/src/components/ChatWindowing/UnifiedChatSurface.tsx`
- Project chat window manager + dock/floating/maximized hosts:
  `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
- Project chat manager in the overview pane:
  `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatManager.tsx`
- Section chat rendering:
  `frontend/src/components/Section/Layouts/ChatArea.tsx`
- Persistent runtime window state:
  `frontend/src/state/actions/projectChatWindowing.ts`

## Operational Implications

- Tests and manual verification must target the visible chat window surface for
  live project-chat interactions, not `#OverviewPane`.
- If a project previously relied on the old embedded section-chat layout, the
  correct v1 behavior is to render through the unified chat/windowing system
  without compatibility fallbacks.
- Follow-up work for additional section/window rollout stays in deferred items
  `CW-036` and `CW-037`, not in migration code inside the v1 implementation.
