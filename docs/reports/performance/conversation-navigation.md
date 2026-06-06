# Conversation Navigation Performance

## 2026-06-03 Baseline Before Stale-While-Revalidate Navigation

Scenario: selecting a conversation or switching workspaces through the renderer
chat store before the workspace-keyed summaries and detail cache refactor.

Measurement source: code-derived baseline from the previous
`workspaceSwitchLoadingPatch`, `loadWorkspace`, and `ConversationBody` paths.
Selection-time loading patches cleared selected conversation detail, messages,
transcript, run items, queued runs, diagnostics, and conversation summaries for
workspace switches. `ConversationBody` rendered `Loading workspace chats.` for
every workspace switch before checking for renderable previous detail.

Results:

- Per-conversation detail cache entries: 0
- Expanded non-selected workspace summary owner: `WorkspaceSidebar` local state
- Cold workspace switch renderable previous transcript: no
- Cached conversation selection immediate transcript swap: no
- Forbidden intermediate labels possible during conversation navigation:
  `Loading workspace chats.`, `Loading chats`, false empty conversation rows

## 2026-06-03 After Workspace Summaries And Detail Cache

Scenario: same renderer workflow after moving conversation summaries into the
chat store, adding `conversationDetailsById`, preserving previous detail during
cold transitions, and hydrating cached conversations immediately while
revalidating.

Measurement command:

```sh
pnpm vitest run src/renderer/src/stores/chat-store.test.ts src/renderer/src/components/workspace-sidebar-model.test.ts src/renderer/src/components/chat-panel.test.tsx
```

Additional production-path guard: deterministic Electron workflow
`conversation-switch` samples `document.body.innerText` during a populated
conversation switch and fails if `Loading workspace chats.`, `Loading chats`,
`No chats`, or `Start a conversation for this workspace.` appears.

Results:

- Per-conversation detail cache entries: one per selected conversation as detail
  patches arrive
- Expanded non-selected workspace summary owner: chat store
  `conversationListsByWorkspaceId`
- Cold uncached conversation selection renderable previous transcript: yes
- Cached conversation selection immediate transcript swap: yes
- Known conversation lists remain visible while refreshing; unknown or
  loading-empty lists render no child rows instead of loading/empty placeholders
