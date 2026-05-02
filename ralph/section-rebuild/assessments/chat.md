# Chat Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  - `internal/projectstate/frontend_section_codeobj_contracts.go` defines `Chat` as a real frontend section type with managed/chat id/config fields plus `ChatSectionState`.
  - `internal/projectstate/chat_sections.go` defines Chat settings, permission modes, dictation modes, messages, input text, waiting state, tool-call arguments, active branch id, and branch history persistence.
  - `frontend/src/utils/generatedTypes.ts` exposes the generated `ChatSectionImpl`, `ChatSectionState`, `ChatRoleEnum`, `ChatPermissionModeEnum`, and `ChatDictationModeEnum` surfaces used by the frontend.
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` routes `SectionTypeEnum.Chat` to `UnifiedChatSurface`.
  - `frontend/src/components/Section/Layouts/ChatArea.tsx` selects managed vs scriptable chat, renders message history, thread history/new-chat controls, scope warnings, plan-mode badge, and `ChatInput`, then emits send/stop events and persists chat state.
  - `frontend/src/components/Chat/ChatInput.tsx`, `frontend/src/components/Chat/ChatMessages.tsx`, `frontend/src/components/Chat/chatComposerControls.ts`, and `frontend/src/components/Chat/engineUtils.ts` define composer attachments, dictation, slash commands, stop/send behavior, context token telemetry, execution settings, role rendering, branches, tool calls, and streaming response state.
  - `frontend/src/components/Section/Container/StateMachineEdgeHandles.tsx` marks Chat sections as both source and target handles with a Chat-specific scope offset, and `frontend/src/components/Section/Header/HeaderIcon.tsx` identifies Chat with the chat icon.
- Data shown:
  - Section title/type, managed state, chat id, engine config id, agent profile id, permission mode, search enabled, thinking enabled, dictation mode, waiting-for-response state, context token usage, active branch id, branch count, scope edge count, tool-call argument ids, messages with roles, attachments, and composer draft text.
- Controls/actions:
  - Standard section shell controls remain in the flat prototype titlebar.
  - Chat-specific body controls are thread `History`, `New Chat`, branch switch indicators, composer textarea, attachment, dictation, slash command hint, send/stop action, and execution/status chips for permission/search/thinking/context.
  - Chat source and target edge handles are represented as section edge affordances because the real Chat section can participate in Chat -> Section and Chat -> Chat scope links.
- Important states:
  - Managed chat with an active existing chat id.
  - Waiting for response switches the composer action from send to stop and marks the assistant response as streaming.
  - Tool-call arguments are present while a tool/action is active.
  - Branch state and history/new-thread controls remain visible.
  - Execution settings include minimal permission mode, search enabled, thinking enabled, and automatic dictation.
- Interactions that must stay recognizable:
  - Reading user/assistant/tool activity in a scrollable transcript, switching or resuming branches, opening thread history, starting a new chat, editing composer input, attaching a file, using dictation/slash commands, stopping a running response, and understanding which scope edges the chat can use.

## Layout Invariants
- Conceptual regions and ordering:
  - External preview/gallery section-type label above the prototype.
  - Shared flat section titlebar first.
  - Compact chat status/thread controls above the transcript.
  - Scrollable message transcript is the dominant body region.
  - Composer and execution telemetry sit at the bottom of the section.
  - Chat source/target edge affordances remain visually separate from message content and composer controls.
- Relative placement of important controls:
  - `History` and `New Chat` stay near the top of the Chat body, matching the managed chat thread controls.
  - Waiting/stop state is adjacent to the composer because it is part of message submission.
  - Context, permission, search, thinking, and dictation state are secondary execution/composer metadata, not titlebar controls.
  - Agentic edge handles sit at the section edges rather than inside the transcript.
- Grouping/containment relationships:
  - Thread/status controls form a compact toolbar region.
  - Messages are grouped by role in one transcript surface.
  - Tool-call arguments and streaming state are nested under the assistant activity they belong to.
  - Composer attachments and input are grouped together at the bottom.
- Scroll or overflow expectations:
  - The message transcript should scroll internally when history is long.
  - The composer should remain visible.
  - The section shell and Chat body should not overflow.

## Intentional Differences
- What the flat prototype is allowed to change: production chat bubbles, tool accordions, Radix portals, third-party icons, and exact message styling may be simplified into static semantic HTML/CSS while preserving the real transcript/composer/thread/edge affordances.
- What production layout logic is intentionally not reused: no `ChatArea`, `ChatInput`, `ChatMessageList`, Zustand selectors, OpenAPI mutation wiring, streaming hooks, Tailwind class chains, portal logic, keyboard handlers, measurement hooks, or production section container DOM are copied.
- Confirmation that the prototype is not fictional and is not an old-design lift: every visible Chat-specific element maps to the real `ChatSectionImpl`, `ChatSectionState`, managed chat behavior, composer controls, thread history controls, role rendering, branch state, tool-call state, or Chat source/target edge handle support.
- Confirmation that every visible prototype affordance maps to real section behavior or data: managed/chat id/config state, permission/search/thinking/dictation settings, waiting response, context usage, role messages, attachment, branch selector, history/new controls, tool-call argument status, composer draft, stop action, and source/target scope handles all map to inspected source.
- Confirmation that the required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly changed: this task will add Chat-only functions/styles/tests and gallery entries, without altering Callable or Dict fixtures, body structure, controls, row hierarchy, ports, or CSS.

## Component Plan
- New files or functions:
  - Add `chat` to `FlatSectionKind`, generated Chat enum imports, and the prototype icon mapping.
  - Add Chat fixture data, `FlatChatBody`, and `FlatChatSectionPrototype` in `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
  - Add Chat-specific CSS in `FlatSectionPrototype.css`.
  - Add dark/light gallery entries with the external `Chat` label.
- Static fixture data:
  - Managed chat id `chat-release-review`, engine config `engine-setta-llm`, agent profile `agent-reviewer`, permission mode `minimal`, search enabled, thinking enabled, automatic dictation, active branch `branch-main`, three branches, waiting response, context usage `18.4k / 64k`, one attachment, and one active tool-call argument entry.
- Tests/verification:
  - Extend `FlatSectionPrototype.test.tsx` to include Chat in gallery counts/labels and verify Chat-specific markup, absence of unrelated row/port/code/terminal/iframe controls, source/target edge affordances, and protected Callable/Dict isolation.
  - Add a CSS guard that Chat stays transcript/composer-oriented with scroll contained inside the message list.
  - Run focused Vitest for `FlatSectionPrototype.test.tsx`, formatting checks, `git diff --check`, and CDP visual verification of `/internal/flat-section-prototype` when feasible.
