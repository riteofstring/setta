# Project Chat Surface Shells

Date: `2026-03-16`

## Slice

Extracted the project-chat header/body render shells and conversation-search
state out of `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
into:

- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSurfaceChrome.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSurfaceBody.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatAuxViewContent.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/useProjectChatConversationSearch.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/projectChatSurfaceViewModel.ts`

## Baseline

CDP check on `http://127.0.0.1:3002/racing_busy` with the Project AI Chat pane
selected in its default chat view:

- Viewport: `1400x900` window
- `ProjectChat.tsx`: `1848` lines before the extraction
- DOM metrics:
  - `allNodes`: `831`
  - project-chat nav button count: `3`
  - project-chat nav width: `458`
  - conversation-search width: `349`
  - aux tabs visible: `false`
  - inline-thread header host visible: `false`

## After

Same page and pane after the extraction:

- `ProjectChat.tsx`: `1377` lines
- `projectChatSurfaceChrome.tsx`: `273` lines
- `projectChatSurfaceBody.tsx`: `173` lines
- `useProjectChatConversationSearch.ts`: `105` lines
- `projectChatSurfaceViewModel.ts`: `125` lines
- `projectChatAuxViewContent.tsx`: `41` lines
- DOM metrics at the same `1400x900` window:
  - `allNodes`: `831`
  - project-chat nav button count: `3`
  - project-chat nav width: `458`
  - conversation-search width: `349`
  - aux tabs visible: `false`
  - inline-thread header host visible: `false`
- Narrow viewport check at `1024x720` window:
  - `document.scrollWidth === document.clientWidth`
  - conversation search remained visible in chat view
  - return-to-chat chrome stayed hidden until an aux surface was opened

## Notes

- The settings popover still opened from the project-chat header, and the
  `Skills` tool action still switched into the aux surface with aux tabs,
  a visible return-to-chat button, and the conversation-search box hidden.
- The before/after DOM metrics stayed flat for the default chat view, which is
  the expected outcome for this behavior-preserving ownership split.
- Console noise during CDP verification still included the existing React 19
  `element.ref` warnings and pre-existing narrow-viewport Git Graph SVG width
  warnings.
