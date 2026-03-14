# Branch Intent Summary

Compared against `main` from merge base `25c24a5376dbc723b96a5e3061e54a3cfb609b71`.

## Features

### 1. Built-in Project Chat app-generation slash commands now submit real app-generation requests
What changed: Before this branch, `/app-json`, `/app-image`, `/app-prompt`, and `/app-mcp` only switched a local app-generation mode. The user still had to go through App Config to author or reuse a prompt and actually initiate generation. After this branch, each built-in slash command carries its own fixed baseline prompt, appends any typed suffix text once, preserves attachments, and submits immediately through Project Chat with an explicit `appGenerationMode`.

Why this appears intentional: The branch adds a dedicated shared definition table for built-in app-generation commands and prompt baselines, rewires slash-command execution to submit prompt templates, updates docs to say Project Chat is the primary app-generation prompt surface, and adds both Vitest and Playwright coverage for the new direct-submit flow.

Files, endpoints, and components involved: `frontend/src/components/Chat/appGenerationSlashCommands.ts`, `frontend/src/components/Chat/chatComposerControls.ts`, `frontend/src/components/Chat/ChatInput.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`, `frontend/src/components/Chat/appGenerationSlashCommands.test.ts`, `frontend/src/components/Chat/chatComposerControls.test.ts`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-app-generation-slash-commands.spec.ts`, `docs/reference/chat-sections.md`, `docs/reference/app-spec-patching.md`. The submit path now goes through Project Chat into `submitMessage` and `/api/getLLMResponse` with `appGeneration` metadata attached.

Default-value, flow, and logic relocation details: Prompt baselines moved out of App Config and the deleted `frontend/src/components/Panes/Overview/App/appGenerationModes.ts` file into `frontend/src/components/Chat/appGenerationSlashCommands.ts`. The flow moved from “select mode now, generate later elsewhere” to “slash command determines mode and baseline prompt in one step.” `/app-image` now relies on chat attachments plus optional suffix text instead of a dedicated App Config reference-image form.

Reviewer guardrail: Do not revert these built-in slash commands back to mode toggles, do not reintroduce a second prompt picker/chooser step for them, and do not duplicate the baseline prompt text or mode mapping across multiple components again unless a new product decision is made.

### 2. App Config was intentionally narrowed into an advanced JSON-render workbench
What changed: Before this branch, App Config mixed together app-generation mode selection, prompt authoring, image-reference inputs, in-pane JSON patch streaming, hidden chat submission, and advanced app-definition editing. After this branch, the default App Config surface is focused on the app-definition workbench: `Show Preview`, `Create Default`, `Validate`, `Save`, the main `App Spec JSON` editor, and validation output. Generation controls were removed from the pane.

Why this appears intentional: The branch deletes a large amount of App Config generation-specific code, deletes App Config tests that existed only to exercise hidden generation and in-pane generation flows, updates docs to describe App Config as the advanced workbench rather than the main prompt-entry surface, and adds E2E coverage that explicitly asserts the generation controls are gone from the default pane.

Files, endpoints, and components involved: `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`, deleted `frontend/src/components/Panes/Overview/App/AppConfigPane.prompt.test.ts`, deleted `frontend/src/components/Panes/Overview/App/AppConfigPane.hiddenGeneration.test.ts`, deleted `frontend/src/components/Panes/Overview/App/AppConfigPane.buildSpecSeed.test.ts`, deleted `frontend/src/components/Panes/Overview/App/appGenerationModes.ts`, deleted `frontend/src/components/Panes/Overview/App/appGenerationModes.test.ts`, deleted `frontend/src/components/Panes/Overview/App/appGenerationModes.perf.test.ts`, `frontend/tests/e2e/overview/app-config/app-config-pane.spec.ts`, `docs/plans/app-config-chat-prompt-surface-plan.md`, `docs/reference/app-spec-patching.md`. App Config is now centered on `route_get_app_definition`, `route_set_app_definition`, and `route_validate_app_definition` rather than its old `streamAppSpec` and hidden chat-generation paths.

Default-value, flow, and logic relocation details: The old editable `Generation Prompt`, `Reference image URL`, `Reference image notes`, `Generate In Pane`, `Send To Chat`, `Prompt Builder`, `MCP Server`, and streaming-toggle flows were removed from App Config. Logic for initiating app generation moved into Project Chat slash commands. App Config now reads as “edit/preview/validate/save the resulting app definition,” not “compose prompts here.”

Reviewer guardrail: Do not add the removed generation controls back into the default App Config surface or treat their removal as accidental cleanup. This branch is intentionally separating “chat starts generation” from “App Config edits the result.”

### 3. The app-definition surface was intentionally reframed and renamed to “JSON Render”
What changed: Before this branch, the overview/tab/menu framing used the broader labels `App` and `App Gen`, and the pane itself surfaced `App Config`. After this branch, the user-facing framing is explicitly `JSON Render`, with hover/quick-info copy explaining that this surface is the advanced app-definition workbench and that generation starts from Project Chat slash commands.

Why this appears intentional: The branch changes the overview tab display string, the overflow-menu label, and adds dedicated explanatory tooltip copy. E2E tests were updated from looking for `App Config` to looking for the `JSON Render` heading and its guidance.

Files and components involved: `frontend/src/utils/constants.ts`, `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/tests/e2e/overview/app-config/app-action-policy.spec.ts`, `frontend/tests/e2e/overview/app-config/app-config-ai-auto-apply.spec.ts`, `frontend/tests/e2e/overview/app-config/app-config-fields.spec.ts`, `frontend/tests/e2e/overview/app-config/app-config-generate-streaming.spec.ts`, `frontend/tests/e2e/overview/app-config/app-config-live-preview.spec.ts`, `frontend/tests/e2e/overview/app-config/app-config-pane.spec.ts`.

Default-value and renamed-flow details: The overview tab prettified name changed from `App` to `JSON Render`. The overflow-menu item changed from `App Gen` to `JSON Render`. The visible quick-info now explicitly tells users to use `/app-json`, `/app-image`, `/app-prompt`, and `/app-mcp` in Project Chat to initiate generation.

Reviewer guardrail: Do not rename this surface back to the older broader “App” framing or remove the tooltip copy without a deliberate reversal of the chat-first product direction.

## Bug Fixes

### 1. Re-running an app-generation slash command in the same mode is no longer a no-op
What changed: Before this branch, if the relevant app-generation mode was already selected, `executeManagedChatSlashCommand` returned “App mode already set to ...” and did not submit anything. After this branch, the “unchanged mode” short-circuit is gone, so `/app-json`, `/app-image`, `/app-prompt`, and `/app-mcp` still submit their built-in prompt baselines even when that mode was already active.

Why this appears intentional: The executor no longer takes the current `appGenerationMode` as an input for this decision, and the new tests assert direct submission behavior rather than mere mode changes.

Files and components involved: `frontend/src/components/Chat/chatComposerControls.ts`, `frontend/src/components/Chat/chatComposerControls.test.ts`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`.

Reviewer guardrail: Do not restore the old “already in this mode, so do nothing” behavior. For built-in app-generation slash commands, repeated execution is now intentionally treated as a fresh submission request.

### 2. Built-in app-generation slash commands now preserve attachments and suffix text through the same submission path as custom prompt commands
What changed: Before this branch, the built-in app-generation slash commands did not go through the prompt-template submission flow, so they did not submit a fully composed `baseline prompt + optional suffix + cloned attachments` payload. After this branch, built-in commands reuse `resolveCustomPromptSlashCommandSubmission`, so optional user suffix text is appended once and attachments are preserved on submission.

Why this appears intentional: `ChatInput` now has a dedicated `submitPromptTemplate` path for built-in commands, and Playwright coverage explicitly checks that `/app-image` preserves the uploaded attachment while sending the fixed image-oriented baseline prompt.

Files, endpoints, and components involved: `frontend/src/components/Chat/ChatInput.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-app-generation-slash-commands.spec.ts`.

Reviewer guardrail: Do not split built-in commands back onto a separate submission path that loses attachments, appends the suffix twice, or omits the explicit `appGeneration` payload.

### 3. Opening App Config is no longer coupled to hidden-generation engine preloading and stale generation state
What changed: Before this branch, App Config carried substantial hidden-generation state and helper logic: prompt text, reference-image state, patch counters, generation hints, LLM config loading, engine selection, hidden chat routing, and stream error handling. After this branch, that state is gone from App Config; the pane only manages persisted app-definition editing, previewing, validation, and saving.

Why this appears intentional: The hidden-generation helper code and associated tests were removed wholesale rather than being partially left behind, which strongly indicates the branch is intentionally eliminating that behavior rather than accidentally breaking it.

Files and components involved: `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`, deleted `frontend/src/components/Panes/Overview/App/AppConfigPane.hiddenGeneration.test.ts`, deleted `frontend/src/components/Panes/Overview/App/appGenerationModes.ts`.

Reviewer guardrail: Do not reintroduce hidden-generation preflight loading, hidden engine-selection logic, or patch-count/status state into App Config as a “fix.” This branch is explicitly removing that coupling.

## Intentional Behavior Changes To Preserve

### 1. Project Chat now owns app-generation prompting; App Config owns inspection, editing, preview, validation, and save
What changed: The old dual-surface model let App Config act as another prompt-composition and generation-entry surface. The new branch makes Project Chat the single intentional place to start app generation and leaves App Config as the place to inspect and edit the result.

Why this appears intentional: This direction is stated explicitly in `docs/plans/app-config-chat-prompt-surface-plan.md` and reinforced by both code and tests.

Files and components involved: `docs/plans/app-config-chat-prompt-surface-plan.md`, `docs/reference/chat-sections.md`, `docs/reference/app-spec-patching.md`, `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`, `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`.

Reviewer guardrail: Follow-up reviews should not ask to “restore parity” by putting prompt-entry UX back into App Config unless product direction changes again.

### 2. Built-in app-generation prompts are intentionally fixed and centralized; custom slash commands are the current override path
What changed: Before this branch, mode-specific prompts lived in App Config and could be edited there. After this branch, the built-in app-generation commands have fixed baseline prompts stored in one shared source of truth, while project-specific custom slash commands remain the place to define a materially different prompt baseline.

Why this appears intentional: The new shared command-definition module, updated docs, and deleted prompt-editing UI all point in the same direction.

Files and components involved: `frontend/src/components/Chat/appGenerationSlashCommands.ts`, `frontend/src/components/Chat/chatComposerControls.ts`, `docs/reference/chat-sections.md`, deleted `frontend/src/components/Panes/Overview/App/appGenerationModes.ts`.

Reviewer guardrail: Do not “helpfully” move the built-in prompt text back into App Config, and do not add fallback prompt heuristics. If the product needs configurable baselines again, that should be a new decision, not a silent review-time rollback.

### 3. Image-guided app generation should use chat attachments, not App Config reference-image fields
What changed: The old App Config flow had dedicated `Reference image URL` and `Reference image notes` inputs for image-guided generation. Those fields are gone. The new `/app-image` flow submits through Project Chat, carries the explicit `json_render_with_image` mode, and preserves the image attachment in the chat request.

Why this appears intentional: The App Config reference-image inputs and tests were removed, while new Playwright coverage validates `/app-image` with an attached file.

Files and components involved: deleted App Config image-reference UI in `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`, `frontend/tests/e2e/overview/project-ai/project-ai-chat-app-generation-slash-commands.spec.ts`, deleted `frontend/tests/e2e/overview/app-config/app-config-mcp-mode.spec.ts`, deleted `frontend/tests/e2e/overview/app-config/app-config-generate-prompt.spec.ts`.

Reviewer guardrail: Do not re-add the App Config image URL/notes form as a “missing feature” without a new product call. This branch is intentionally moving image guidance into the chat submission flow.

### 4. Advanced metadata/theme/assets controls are intentionally collapsed out of the default workbench view
What changed: Before this branch, catalog ID, spec version, theme mode, spec path, preview config, theme JSON, and assets JSON were all visible inline in App Config. After this branch, those controls live under an `Advanced` accordion and the default visible surface is much narrower.

Why this appears intentional: `AppConfigPane.tsx` introduces a dedicated accordion with this exact grouping, and Playwright coverage asserts these fields are hidden until `Advanced` is opened.

Files and components involved: `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`, `frontend/tests/e2e/overview/app-config/app-config-fields.spec.ts`, `frontend/tests/e2e/overview/app-config/app-config-pane.spec.ts`.

Default-value changes: `Advanced` is collapsed by default. The default visible surface is now intentionally biased toward spec editing and validation rather than metadata/configuration.

Reviewer guardrail: Do not flatten these controls back into the default surface just because they existed there before. Their new collapsed placement is part of the branch’s simplification goal.

### 5. The `JSON Render` naming and tooltip guidance are part of the intended UX shift, not incidental copy churn
What changed: The renamed tab/menu label and tooltip copy now explain the narrower purpose of the pane and redirect generation initiation to Project Chat slash commands.

Why this appears intentional: The copy changes are paired with the underlying behavior shift and backed by test updates.

Files and components involved: `frontend/src/utils/constants.ts`, `frontend/src/components/Panes/Overview/Overview.tsx`, `frontend/tests/e2e/overview/app-config/app-config-pane.spec.ts`.

Reviewer guardrail: Do not strip these labels/tooltips in cleanup reviews as “nonessential wording.” They are carrying the product intent that prevents users and reviewers from reinterpreting the pane as the main app-generation entry point.
