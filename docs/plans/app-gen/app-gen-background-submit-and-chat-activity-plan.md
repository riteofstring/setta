# App Gen Background Submit + Global Chat Activity Plan

## Goals
- Clicking `Generate App` should keep the user on `App Config` instead of switching to `Project AI Chat`.
- The generated prompt (and optional style image attachment) should be submitted to the LLM behind the scenes.
- If the user opens `Project AI Chat`, they should see the live conversation/history for the background-submitted request.
- Add a global `settaGlobalAIChatActive` state so the sidebar chat icon can show an active treatment similar to continuous run.

## Current Behavior (Baseline)
- `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx` builds the prompt and stores it in `useAIStore.pendingProjectChatPrompt` (and attachments in `pendingProjectChatAttachments`).
- The same handler forcibly switches pane state via `useLocalStorage.setState({ overviewTab: ProjectAIChat, overviewVis: true })`.
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx` consumes pending prompt/attachments and pre-fills the chat input, but does not auto-submit.
- Sidebar icon highlighting in `frontend/src/components/Panes/Overview/Overview.tsx` is tab-selection based, not chat-activity based.

## Proposed UX
- `Generate App` submits immediately in the background.
- Pane/tab state does not change.
- Project AI chat history updates in store while the request runs.
- Opening chat later shows the sent message and assistant output.
- Sidebar `ProjectAIChat` icon gets an active animated treatment while global chat activity is true.

## Implementation Plan
1. Add a background submit action for project chat.
- File: `frontend/src/state/actions/ai.ts`
- Add a new action (for example `submitProjectChatInBackground`) that accepts `message`, `attachments`, and optional source metadata.
- Action responsibilities:
- Ensure engine/LLM prerequisites are loaded.
- Resolve a usable engine config using shared logic currently in `ProjectChat.tsx`.
- Submit via existing `submitMessage(...)` flow.
- If no active chat exists, initialize pending chat state, submit with `chatId: null`, and finalize pending chat details with returned chat id.
- Preserve existing optimistic message behavior and error rollback.

2. Extract reusable engine-selection logic.
- File: `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChat.tsx`
- Move `findPreferredEngineId` and `isEngineUsable` into a shared utility module (for example under `frontend/src/components/Chat/` or `frontend/src/state/actions/`).
- Use the shared utility both in `ProjectChat.tsx` and the new background-submit action to avoid divergent engine selection behavior.

3. Add global chat-activity state.
- File: `frontend/src/state/definitions.ts`
- Add ephemeral AI store fields:
- `settaGlobalAIChatActive: boolean`
- Optional supporting field for robustness, e.g. `settaGlobalAIChatActiveCount: number` or source id list.
- Update AI action lifecycle in `frontend/src/state/actions/ai.ts` so background submit toggles activity on start and clears when chat is no longer waiting.
- Keep this non-persisted.

4. Update `Generate App` handler to submit in place.
- File: `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`
- Keep prompt generation and style-note attachment logic.
- Replace pending-prompt seeding + forced tab navigation with a call to the new background submit action.
- Keep `overviewTab` unchanged.
- Continue style-image ownership transfer logic after queue/submit starts.

5. Decide fate of pending prefill state.
- Files:
- `frontend/src/state/definitions.ts`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
- If `pendingProjectChatPrompt` / `pendingProjectChatAttachments` are only used by App Config, remove them and their hydration effects in `ProjectChatCore.tsx`.
- If used by other flows, retain as fallback but stop using them in App Config’s `Generate App` flow.

6. Add sidebar icon active styling tied to global chat activity.
- File: `frontend/src/components/Panes/Overview/Overview.tsx`
- For `OverviewTabNameEnum.ProjectAIChat`, augment icon rendering so when `settaGlobalAIChatActive` is true it uses the same active treatment style family as continuous run (`setta-gradient-border-shell` + `setta-animated-gradient-border` from `frontend/index.css`).
- Keep existing tab-selected behavior and accessibility labels.

## Test Plan
1. Update Playwright flow coverage.
- File: `frontend/tests/e2e/overview/app-config-generate-prompt.spec.ts` (or split into a new spec)
- Verify `Generate App` does not switch away from `App` tab.
- Verify background request starts and chat icon enters active state.
- Open `Project AI Chat` manually and verify the generated message exists and response is in progress/completes.

2. Add/adjust Vitest coverage.
- Add action-level tests for background submit lifecycle in `frontend/src/state/actions/` tests.
- Add an `Overview` UI test verifying `ProjectAIChat` icon class toggles with `settaGlobalAIChatActive`.
- Remove or rewrite assertions that depended on prefilled (not auto-submitted) prompt behavior.

## Verification Checklist
- `pnpm -C frontend exec vitest run <updated-tests>`
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/<updated-spec>.spec.ts`
- CDP visual verification:
- Confirm `Generate App` keeps `App Config` visible.
- Confirm sidebar chat icon shows active animated treatment while response is running.
- Confirm opening chat mid-run reveals live conversation.

## Risks / Open Questions
- Engine selection is currently UI-owned in `ProjectChat.tsx`; background submission needs a deterministic non-UI path.
- Multiple concurrent background sends may require counter-based activity state instead of a single boolean.
- If backend/engine config is unavailable, App Config should surface a clear inline or toast error without navigation.
