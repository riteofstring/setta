# Easy Button, Settings Page, and Narrator Clarity Plan

**Date:** 2026-07-18

**Status:** In progress — Phase 0 repository-local baseline recorded; external evidence remains a release gate

**Scope:** Desktop Easy Button conversation creation and pane presentation, shell-level Settings navigation, user-visible narrator projections, and assistant speech synthesis cadence.

## Non-negotiable clean cutover

This plan defines one current product and contract path only.

- Do not add backward-compatibility shims, migrations, legacy parsers, old-field or old-value aliases, transitional adapters, feature flags, dual read/write, silent conversion, silent cleanup, or fallback behavior.
- Remove superseded owner values, state shapes, UI paths, runtime branches, fixtures, and assertions in the same implementation.
- Tests cover only the new contract. Delete fixtures for removed variants instead of using them to prove recovery or translation.
- Data containing a removed value is outside the new contract. No code may recognize it specially, convert it, preserve it, or provide variant-specific recovery.
- If implementation discovers that a clean replacement is not possible, stop and revise this plan instead of adding compatibility code.

## Outcome

Users can deliberately create as many independent Easy Button conversation panes as they need, Settings opens as a full-view application page instead of occupying the workspace, and the narrator communicates meaningful progress in clear, compact language at a brisker speaking pace.

The product contract is:

> **New conversation** creates a new durable conversation in the requested frame, without an arbitrary Easy Button pane cap. **Settings** replaces the whole visible application view until the user returns to the untouched workspace. Narrator highlights say what meaningfully changed with enough context to be useful, and spoken assistant audio is synthesized at the product's brisker pace.

## Current-state diagnosis

The four complaints are real, but their causes are more specific than they first appear.

| Symptom | Current behavior | Root cause |
| --- | --- | --- |
| A second Easy Button pane appears impossible | The compositor can render multiple Easy Button panes, but the generic new-frame menu excludes them. The only extra-view affordance mirrors an existing conversation, which does not create another independent workspace. | First-run bootstrap is the only ordinary renderer path that creates a conversation, and Easy Button panes have an arbitrary fixed limit of 10. |
| Settings behaves like workspace content | `settings-dom` is a Go-owned workspace surface with pane chrome, layout persistence, scheduling policy, a one-pane cap, and entries in the new-frame and empty-frame menus. | Application navigation is incorrectly modeled as a workspace pane. It competes with the user's work and cannot cover the project sidebar or entire application view. |
| Narrator speech feels slow | OpenAI speech synthesis is called without `speed`, so it uses the provider default of `1.0`. Renderer playback also uses the default rate. | Setta has no explicit speech-domain cadence. |
| Highlights are long and jargony | A milestone may be 240 characters, final and status text may be 1,200 characters, and the instructions ask for a sparse phase change without defining plain language or user relevance. Several fake-provider examples use internal phrases such as “evaluated through sequence” and “provider boundary.” | “Concise” is a suggestion instead of an output contract, and current examples reinforce implementation-diary prose. |

This means replacing 10 with a larger pane limit, maximizing a Settings pane, speeding up HTML audio, or adding “be concise” to one prompt would address symptoms without correcting the product boundaries.

## Product principles

1. **Every user-created Easy Button pane starts an independent durable conversation.** Selecting an existing conversation focuses its pane; it does not mirror that conversation into another pane.
2. **Creation must be discoverable where placement begins.** The Conversations section, new-frame menu, and empty frame should all expose the same domain action without constructing an unbound Easy Button surface.
3. **Placement is part of the command.** An action selected inside an empty frame must fill that exact frame. It must not open somewhere else and leave the selected frame empty.
4. **Application pages are not workspace panes.** Settings belongs to shell navigation and must not consume, resize, focus, persist, or schedule a workspace frame.
5. **A page transition must preserve the workspace underneath it.** Opening Settings hides and deactivates the whole workspace without rebuilding it; returning restores the exact layout and focus.
6. **Language quality belongs at the source.** Generate display-ready and voice-ready narration. Do not repair bloated prose with renderer truncation or a jargon replacement pass.
7. **Use semantic instructions plus mechanical bounds.** Prompts define relevance, voice, and plain-language behavior; schemas and validators enforce maximum size and cardinality.
8. **Speech cadence belongs to the speech domain.** Master and narrator audio share one brisk default unless listening evidence justifies a role-specific difference. Callers do not submit arbitrary rates.
9. **Scale through scheduling, not a product cap.** The workspace already controls live DOM and visibility. Resource management belongs there rather than in an arbitrary Easy Button pane count.
10. **Fail specifically and preserve durable truth.** If a conversation is created but its pane cannot be presented, keep the valid zero-pane conversation in the navigator and explain what failed. Do not silently archive or delete it.

## Decisions

### 1. Make **New conversation** the Easy Button pane action

Add one user-facing pane command:

- **New conversation** — creates a new durable topic conversation and presents it in a new pane or the exact selected empty frame.

The primary entry points are:

- a persistent, accessible **New conversation** button in the Conversations section header;
- a **Conversation** item in the workspace **New frame** menu;
- a **Conversation** choice inside an empty frame.

Remove the existing hover-only duplicate-view control and the renderer's `open-new-view` command path. Make the current invariant one conversation ID to at most one Easy Button pane: change the renderer projection from conversation-to-pane-array to conversation-to-optional-pane, remove multiple-view counts, and reject workspace layouts that bind one conversation ID to more than one pane. Selecting a navigator row focuses its existing pane or opens one when absent; it never creates a second pane for the same conversation.

Remove the fixed Easy Button surface limit. **New conversation** remains available regardless of the number of existing Easy Button panes. Browser and diagnostic surface policies are outside this plan; the Easy Button action must not inherit their caps.

### 2. Give conversation creation one application-level owner

Introduce one renderer application command for creating and presenting a topic conversation. Reuse it from user-facing commands and first-run bootstrap so startup is not a separate implementation of creation semantics.

The command owns this sequence:

```text
placement intent
  -> verify workspace availability
  -> verify the requested target frame still exists
  -> create the durable conversation through conversations.create
  -> hydrate/project the authoritative conversation
  -> bind and focus the requested pane
  -> let normal workspace persistence record the binding
```

Do not add `easy-button` to the existing raw `OpenPaneRequest` list. An Easy Button pane requires a durable `conversationId`, so conversation creation is a domain command rather than a generic surface configuration.

Replace the toolbar/empty-frame action shape with an exhaustive discriminated union along these lines:

```text
surface action
  - raw Browser request

conversation action
  - create in a new pane
  - create in a named empty-frame pane
```

Likewise, make conversation presentation intent exhaustive instead of accumulating ambiguous optional fields or retaining a duplicate-view branch:

```text
existing conversation
  - focus its pane, or open one when absent

new conversation
  - open a new pane
  - replace this exact empty frame
```

The creation command must suppress repeated activation while its request is pending. It must re-check an exact target after the backend responds because another layout action can close that frame.

Failure behavior is explicit:

- If preflight fails, do not call `conversations.create`.
- If conversation creation fails, leave the layout unchanged and show the backend error.
- If creation succeeds but the requested empty frame disappeared, keep the new conversation with no open pane and report that the conversation was created but its frame no longer exists.
- If creation succeeds but presentation fails for another specific layout or persistence reason, keep the new conversation with no open pane and report that it was created but could not be opened.
- Do not fall back to a different frame, destructively roll back the conversation, poll for eventual state, or create a locally invented conversation record.

Continue using the existing provisional title, `New conversation`, so creation is immediate and does not wait on an AI naming call. The authoritative topic descriptor already becomes the navigator subtitle after focus projection. Automatic title generation and conversation renaming are separate product work.

### 3. Replace the Settings surface with a full-view shell page

Model the visible application destination as an exhaustive shell route:

```text
workspace page

settings page
  - active settings section
  - optional typed focus target
```

Opening Settings switches the shell route; it never sends a workspace pane request. Render the Settings page in a root-level `fixed inset-0` layer above the complete application shell so it covers the desktop top bar, project sidebar, workspace panes, mobile controls, and any native browser view.

This is a regular application page, not a modal dialog:

- Give it its own full-width, platform-aware draggable header with the title **Settings** and a visible **Back to workspace** action.
- Do not render a backdrop, workspace pane chrome, resize handles, maximize controls, a dialog role, or a focus trap.
- Focus the page heading or requested settings control on entry. On return, restore the element or focused workspace pane that opened Settings when it still exists.
- Support `Escape` as a secondary return action when a child control has not consumed it; the visible Back action remains the primary route affordance.
- Keep the workspace mounted behind the page, but mark it inert and `aria-hidden`, suspend its pointer/keyboard navigation handlers, and set its native-view occlusion state. Conversation runs, streamed state, and layout persistence may continue; workspace interaction may not leak through the page.
- Returning to the workspace restores its exact pane set, focused pane, maximized/overview state, scroll position, sidebar state, and native browser-view bounds. Opening Settings itself does not write workspace layout state.

Use one typed settings-navigation owner for every entry point:

- desktop top-bar Settings button;
- mobile Settings button;
- project-sidebar Settings button;
- voice-credential setup actions from Easy Button, Global master, and shell speech status; and
- future direct links to a settings section.

The default command opens the last in-session settings section, initially Theme. A targeted command opens its authoritative section and focus target, such as Speech → OpenAI voice connection. Extend the existing settings navigation store into this shell-page state instead of dispatching a DOM `CustomEvent` that pretends to open a pane.

The Settings page is application-scoped and must open even when no workspace is selected, the selected workspace is unavailable, or the runtime is disconnected.

Remove Settings from the workspace model completely:

- delete `SurfaceKindSettingsDOM` and the `settings-dom` discriminator branch from `internal/workspaceui`;
- regenerate the Go-owned TypeScript contracts before deleting downstream renderer code;
- delete the settings pane request, workspace settings DOM surface, React pane adapter branch, runtime policy, pane title metadata, pane-limit entry, benchmark fixture entry, and surface-registry entry;
- remove Settings from the new-frame and empty-frame choices;
- remove the now-settings-only workspace surface-focus request flow and generic open-pane DOM event; and
- retain `SettingsPanel` as the page body, with its active section controlled by the settings-page navigation owner.

### 4. Make narrator prose a field-specific contract

Replace the broad narrator length allowances with generous safety ceilings appropriate to how each field is read and spoken. These are not targets to fill or goals to minimize:

| Field | Purpose | Prompt target | Hard maximum |
| --- | --- | --- | ---: |
| `topicDescriptor` | Stable navigator description | A clear noun phrase, usually 6–12 words | 160 characters |
| `currentFocus` | Current user objective | One complete sentence or phrase, usually 12–30 words | 240 characters |
| `milestones[]` item | A meaningful new result or phase change | One complete sentence, usually 12–24 words | 200 characters |
| `finalSummary` | Outcome plus important evidence or caveats | Two or three compact sentences when needed | 480 characters |
| `statusReply` | Current state, evidence, and blocker/next step when relevant | One or two complete sentences | 400 characters |

Retain the existing maximum of one milestone per projection call. Word ranges are loose model guidance, not a second production validator; character bounds remain deterministic overflow protection. The narrator should use fewer words when the complete update is naturally short and more when the result needs a subject, consequence, or caveat.

Internal checkpoint summaries are not displayed or spoken, so they keep their separate context-compression contract.

Add field descriptions to the strict output schemas and revise the focus, working, terminal, and status instruction builders to say:

- Write for the user whose objective appears in the supplied context.
- State what is now true, what changed, or what is blocking progress.
- Lead with the observable outcome, not the mechanism that observed it.
- Write the shortest **complete** update, preserving the subject, result, and any caveat that changes how the result should be understood.
- Prefer a natural sentence over a compressed fragment or headline shorthand.
- Prefer words already used in the user's objective.
- Use a technical term when the user's task or result genuinely depends on that term; otherwise explain the result in ordinary language.
- Omit Setta's bookkeeping, including projection passes, trajectory cursors, sequence numbers, provider calls, schemas, and typed boundaries, unless that machinery is itself the user's subject.
- Do not prefix text with “Narrator,” “Milestone,” “Update,” or similar meta narration.
- Do not restate the current objective or paraphrase a prior milestone.
- For working projections, return an empty milestone list when no meaningful user-facing change occurred.
- State failures and blockers directly. Brevity must not turn an incomplete or failed result into a success claim.

Include contrasting examples in the narrator instructions. Examples teach voice and relevance, not a fixed vocabulary:

| Avoid | Prefer |
| --- | --- |
| “Narrator evaluated the deployment through sequence 41.” | “The deployment now completes successfully, and failed releases keep the previous version running.” |
| “The provider boundary is now typed.” | “Voice requests now preserve the configured narrator and speaking pace across restarts.” |
| “A terminal projection was durably committed.” | “The final summary is saved with the conversation and remains available after restart.” |
| “Continued working on the current objective.” | No milestone. |

Update fake-provider output and fixtures to model this contract. Tests and demos are part of the product's language environment; they should not normalize prose that would be unacceptable in production.

Validation remains strict: an over-limit provider response is rejected at the narrator output boundary. Do not silently truncate it, summarize it with another hidden call, strip terms with a keyword heuristic, or render only a clipped prefix.

### 5. Give spoken assistant audio a native synthesis pace

Set one synthesis rate owned by `internal/speech`:

| Spoken output | OpenAI synthesis speed |
| --- | ---: |
| Master answer | `1.2` |
| Narrator output | `1.2` |

`1.2` is a modest but clearly perceptible increase. It should shorten the same spoken text by roughly 15–20% without turning answers, status updates, and completion messages into scanning-speed audio. Concise narrator text and faster synthesis are complementary; the speed change is not a substitute for the language contract.

Change the internal provider method from separate text/voice arguments to a typed synthesis input that contains the validated text, resolved voice, and speech-domain rate. Keep the public synthesis request free of a caller-selected speed unless a later product decision introduces user preferences.

The OpenAI client must include the exact `speed` in `/audio/speech` JSON and validate it against the provider's documented `0.25`–`4.0` range. The checked-in OpenAPI document already defines that field and range.

Do not use `HTMLAudioElement.playbackRate`. Native synthesis preserves the provider's intended pitch and pacing, applies equally to desktop and web playback, and makes captured provider requests prove the effective policy.

Do not add a speed slider or invent different master and narrator rates in this change. First ship one coherent default and evaluate both kinds of spoken output. A later role-specific cadence or user preference should be justified by listening evidence and represented by a small set of named rates backed by an owned generated contract, not a free-form renderer constant.

## Cutover deletions

This is a direct correction of current behavior.

- Replace first-run's private create-and-present sequence with the shared command in the same change.
- Remove the duplicate-view affordance, `open-new-view` renderer command branch, plural conversation-to-pane mapping, view-count UI, and their assertions in the same change.
- Make duplicate conversation bindings invalid in the current workspace layout contract. Do not collapse, select among, or otherwise translate duplicate bindings.
- Remove the Easy Button entry from fixed pane-limit policy rather than replacing 10 with another arbitrary number.
- Remove `settings-dom` from the Go-owned workspace contract and all renderer pane machinery in the same change. Do not retain a hidden, parse-only, or deprecated Settings surface variant.
- Once removed, no code or test may branch on, parse for, report specially on, strip, or translate `settings-dom`.
- Replace the `settings-pane` Electron workflow with the `settings-page` workflow in the registered manifest. Do not keep both paths.
- Replace obsolete fake narrator phrasing and assertions in the same change.
- Keep one narration storage contract. The new generation rules must not introduce versioned narration, alternate validators, or an old-output path.
- This plan deliberately changes the Go-owned `SurfaceKind` contract. Run `./scripts/go.sh run ./cmd/generate-contracts` after the owner edit and before downstream cleanup, then commit the generated TypeScript changes without editing them manually. The fixed synthesis-rate policy itself requires no new public contract.
- No dependency change is expected.

## Implementation phases

### Phase 0 — Record a small baseline and lock the contracts

- [x] Capture repository-backed current outputs for explicitly technical work, a real milestone, no meaningful phase change, approval waiting, failure, terminal completion with a caveat, and a status request.
- [x] Add a repository-backed or live-provider nontechnical corpus sample before judging before/after narrator quality; do not substitute invented prose.
- [x] Record character count, word count, internal-mechanism leakage, completeness, and whether each captured repository-backed output tells the user what changed. Do not score shorter output as better when it omits material context.
- [ ] Synthesize fixed representative master and narrator samples at `1.0` and `1.2`; record WAV durations and a brief intelligibility review. This requires an available OpenAI synthesis environment and is not implementation-loop work.
- [x] Capture the repository-local Settings workspace layout baseline from source and the existing settings-pane workflow.
- [ ] Capture visual native Browser-view evidence for the current Settings pane and Browser pane screenshots when a GUI-capable environment is available. This is external release evidence and should not be retried in implementation loops.
- [x] Append repository-local baseline evidence to `docs/reports/narration/narrator-clarity-and-cadence-20260718.md` rather than relying on recollection. Post-change evidence will be appended to the same report during verification.
- [x] Lock the UI labels, Settings page/return semantics, field safety ceilings, narrator rate, placement semantics, and failure messages named in this plan before implementation.

### Phase 1 — Make independent new conversations first-class

- [ ] Add the typed create-and-present application command with new-pane and exact-empty-frame destinations.
- [ ] Reuse the command from first-run bootstrap.
- [ ] Generalize the new-frame and empty-frame action model into an exhaustive surface/conversation union.
- [ ] Add **New conversation** to the Conversations header and **Conversation** to the new-frame and empty-frame choices.
- [ ] Remove the duplicate-view row control and `open-new-view` presentation branch; replace plural conversation-pane projection with an optional single pane ID and enforce unique conversation bindings in workspace layout validation.
- [ ] Remove the fixed Easy Button pane cap from workspace policy and every disabled/count state derived from it.
- [ ] Implement pending, workspace-unavailable, disappearing-target, create-failure, and presentation-failure states without polling or silent fallback.
- [ ] Keep the virtualized navigator and the existing multi-pane runtime; do not introduce per-row global subscriptions or broad DOM growth.

### Phase 2 — Move Settings to shell navigation

- [ ] Add the exhaustive workspace/settings shell route and extend the existing settings navigation store to own open, close, active-section, and typed-focus-target commands.
- [ ] Build the full-viewport Settings page around `SettingsPanel`, including platform-safe drag chrome, **Back to workspace**, focus entry/return, and secondary Escape handling.
- [ ] Make the complete workspace shell inert and accessibility-hidden while Settings is active; gate workspace window/native-view input and occlude native Browser views without unmounting the workspace runtime.
- [ ] Route desktop, mobile, sidebar, master, Easy Button, and shell-speech Settings entry points through the same typed command. Opening from the master overlay closes that overlay first. Delete the settings-specific pane event dispatch and every user-facing “Settings pane” label.
- [ ] Remove `SurfaceKindSettingsDOM` and its discriminated variant from the Go owner, run `./scripts/go.sh run ./cmd/generate-contracts`, and only then remove downstream Settings pane code and generated consumers.
- [ ] Remove Settings from workspace menus, surface adapters, scheduling/visibility policy, benchmark fixtures, pane metadata, layout focus plumbing, and fixed pane limits.
- [ ] Prove Settings opens without a selected/available workspace and targeted voice setup lands on the Speech section and intended control.

### Phase 3 — Replace vague narrator brevity with an output contract

- [ ] Lower the Go-owned narrator limits to the values in this plan and update strict JSON schemas with field-specific descriptions.
- [ ] Rewrite focus, projection, terminal, and status instructions around user relevance, plain language, omission, and direct failure reporting.
- [ ] Add the good/bad examples above to the relevant instruction contexts without embedding a second executable prompt implementation in tests.
- [ ] Update focused narrator validation tests for each new boundary and for one-or-zero milestone cardinality.
- [ ] Replace jargony fake-provider output and downstream assertions with plain, outcome-led fixtures.

### Phase 4 — Apply the shared synthesis cadence

- [ ] Add the shared `1.2` assistant synthesis rate at the speech domain boundary.
- [ ] Pass a typed synthesis input through the speech service and provider interface.
- [ ] Add `speed` to the OpenAI request and reject invalid synthesis-rate values loudly.
- [ ] Extend the speech provider fixture to require and record `speed`, rather than accepting and discarding unknown request behavior.
- [ ] Prove narrator and master requests both use `1.2`, resolved voice ownership is unchanged, and playback arbitration remains serialized.

### Phase 5 — Verify the product workflow, scale, navigation, and language quality

- [ ] Extend the deterministic Electron topic workflow to create distinct conversations through production UI, run them independently, close and restore panes, and exercise exact empty-frame placement.
- [ ] Cover queueing, steering, streamed output, completion/cancellation/failure, queued-work promotion or preservation, and approvals wherever the changed path intersects them.
- [ ] Verify every **New conversation** action creates a different conversation ID with isolated streamed state, while selecting an existing row focuses or restores it without creating another pane.
- [ ] Create more than 10 Easy Button conversations through the production path to prove the old cap is gone, then exercise the established high-pane workspace benchmark without introducing a replacement count limit.
- [ ] Verify rapid-repeat, disappearing-target, reload, and created-but-not-presented behavior through production main/preload/renderer/HTTP/store paths using temporary app data.
- [ ] Replace the registered `settings-pane` workflow with `settings-page`; assert viewport coverage, workspace inertness, unchanged pane identities/count/layout state, native-view occlusion, focused-section navigation, and exact workspace restoration after return.
- [ ] Exercise Settings from desktop, mobile, no-workspace, unavailable-runtime, and voice-credential entry points. Verify pane and overview shortcuts cannot mutate the hidden workspace.
- [ ] Extend the deterministic speech workflow to assert the exact shared narrator/master synthesis payload rate while retaining preemption, cancellation, replay, and one-audio-at-a-time coverage.
- [ ] Run the curated corpus through live Codex with ChatGPT auth, append the actual results to the narration report, and review the outputs against meaning rather than exact wording.
- [ ] If ChatGPT auth is unavailable, report the live-provider skip explicitly; deterministic fake-provider success is not proof of narrator integration.

## Acceptance gates

### Pane behavior

- A user can create a second Easy Button conversation without invoking the master or an API-only path.
- Every **New conversation** activation yields a new conversation ID and pane.
- Selecting **Conversation** in an empty frame fills that exact frame.
- Selecting an existing conversation focuses or restores its pane and never mirrors it into an additional pane.
- Closing a conversation pane leaves the durable conversation in the navigator, and selecting it opens the pane again.
- Workspace layout validation permits each conversation ID in at most one Easy Button pane.
- Reload restores each valid conversation-to-pane binding exactly once.
- The product imposes no Easy Button pane-count limit; creation remains available beyond the former count of 10.
- Unavailable workspace, double activation, and partial failure produce specific visible states and no unbound Easy Button pane.

### Settings page

- Every Settings entry point opens one shell-level page that covers the complete renderer viewport, including the desktop top bar, project sidebar, workspace, and mobile controls.
- Settings is absent from `SurfaceKind`, generated workspace contracts, pane menus, empty-frame actions, persisted layout output, pane scheduling, and workspace benchmark fixtures.
- Opening Settings does not change pane count, focused pane ID, layout revision, presentation mode, sidebar state, workspace scroll position, or persisted workspace JSON.
- The underlying workspace is mounted but inert, accessibility-hidden, and unable to receive pane shortcuts, pointer input, or native Browser-view input while Settings is active.
- Conversation runs and streamed projections continue safely while the page is open.
- **Back to workspace** and unconsumed Escape restore the exact prior workspace and focus; native Browser views return at their prior bounds.
- Settings opens and saves normally without a selected workspace or connected runtime.
- A targeted voice-credential command opens the Speech section and focuses the OpenAI voice control without a DOM pane event.
- The Settings page has page semantics and its own heading/header; it is not exposed as a modal dialog or workspace pane.

### Narrator language

- Every newly generated field passes its new hard character maximum without renderer clipping.
- A milestone states a meaningful new outcome, blocker, or phase change; otherwise the milestone list is empty.
- Nontechnical cases contain no Setta implementation bookkeeping. Technical cases retain the terms necessary to accurately describe the user's task.
- Status and final text state failure or incompleteness directly when present.
- The curated before/after report shows clearer, less bloated outputs and records human-readable examples, not only aggregate counts. It must also flag outputs made ambiguous by over-compression.

### Speech cadence

- Captured OpenAI narrator and master synthesis requests contain `speed: 1.2`.
- The fixed master-and-narrator corpus is materially shorter at `1.2` and remains intelligible in the recorded listening review.
- Voice resolution, persisted-text authority, queue ordering, preemption, cancellation, replay, and audio URL cleanup do not regress.
- Renderer playback does not set `playbackRate` to simulate the feature.

### Performance and architecture

- The sidebar remains virtualized and responsive with a large navigator projection.
- Multiple live Easy Button panes retain current frame-scheduling and DOM-visibility behavior.
- Easy Button scale is governed by the workspace scheduler and available resources, not a hard-coded product count.
- No polling, keyword-based prose sanitizer, raw unbound pane, duplicated creation workflow, manually maintained generated type, or scattered speech-rate constant is introduced.

## Verification sequence

Start narrow, then exercise the required production workflows:

```text
./scripts/go.sh run ./cmd/generate-contracts
./scripts/go.sh test ./internal/workspaceui ./internal/narration ./internal/speech
pnpm -C desktop exec vitest run \
  src/renderer/src/App.test.tsx \
  src/renderer/src/components/settings-panel.test.tsx \
  src/renderer/src/workspace-layout/conversation-pane-coordinator.test.ts \
  src/renderer/src/components/workspace-sidebar-model.test.ts \
  src/renderer/src/workspace-layout/workspace-toolbar.test.tsx \
  src/renderer/src/workspace-layout/surface-dom-content.test.ts \
  src/renderer/src/features/easy-button/initial-easy-button-pane.test.ts
pnpm -C desktop build
node desktop/tests/electron/run-workflows.mjs --workflow settings-page --skip-build
./scripts/test_topic_conversation_workflows.sh
./scripts/format.sh
./check_quality.sh --all
```

Run contract generation immediately after editing the Go owner and before deleting generated consumers; do not turn it into a drift-only test. Use the actual focused test filenames present after implementation rather than creating an alias solely to match this plan. The registered Settings workflow and topic workflow launcher are required because the change crosses shell navigation, native-view occlusion, generated workspace contracts, conversation creation, pane projection, narrator provider behavior, event streaming, persistence, and speech playback. The live Codex portion must use ChatGPT auth and must not use `OPENAI_API_KEY`.

Run `./scripts/check_supply_chain.sh` only if implementation unexpectedly changes a dependency manifest, lockfile, package-manager configuration, Go module configuration, or supply-chain tooling.

## Rejected shortcuts

- **Replace 10 with a larger Easy Button pane limit.** Any new fixed count preserves the same arbitrary failure mode. Scale belongs to the workspace scheduler.
- **Put `easy-button` into the raw pane menu.** A pane without a durable conversation binding violates the workspace contract.
- **Promote the existing duplicate-view control.** Mirroring one conversation does not create the independent workspaces users expect from additional Easy Button panes.
- **Maximize or restyle the Settings pane.** It would still consume workspace layout, persist as a surface, participate in scheduling, and leave application navigation at the wrong ownership boundary.
- **Cover only the workspace canvas.** Settings must also replace the project sidebar, shell controls, mobile bar, and native views.
- **Render Settings as a modal dialog.** The user is navigating to an application page, not making a short blocking decision; page semantics and a Back action are clearer.
- **Open a second Electron `BrowserWindow`.** A full-view shell page satisfies the requested boundary without duplicating preload security, stores, runtime subscriptions, window lifecycle, or focus coordination.
- **Retain `settings-dom` only to read old layouts.** A hidden legacy surface is still a compatibility path and keeps a removed product concept in the owner contract.
- **Open a new pane when an empty-frame target disappears.** That changes the user's placement command and hides a race.
- **Delete a conversation when presentation fails.** Durable creation succeeded; destructive rollback would erase valid user state.
- **Only add “be concise” to the prompt.** The current mechanical limits would still allow bloated output, and the examples would still teach internal prose.
- **Force every highlight into a tiny word budget.** Over-compression can remove the subject, consequence, or caveat and make an update harder to understand.
- **Truncate or rewrite narration in the renderer.** Clipping loses meaning, and keyword replacement cannot understand when a technical term is necessary.
- **Speed up playback in the browser.** Provider-native synthesis produces the intended cadence consistently and is verifiable at the protocol boundary.
- **Use speed to compensate for long copy.** Faster jargon is still poor narration.
- **Add a free-form speed preference now.** There is evidence for a slow default, not yet for the complexity of a settings contract and preference distribution.
- **Assign different speeds merely because speaker types exist.** Source authority and playback priority differ today, but there is no listening evidence that master answers should remain slower than narrator output.

## Source evidence

- `desktop/src/renderer/src/workspace-layout/workspace-scene.ts` — Easy Button panes currently have the fixed limit of 10 that this plan removes.
- `desktop/src/renderer/src/workspace-layout/conversation-pane-coordinator.ts` — focus-or-open and the unwanted additional-view presentation branch currently coexist.
- `desktop/src/renderer/src/stores/conversation-pane-store.ts` — the current plural pane-ID mapping is the duplicate-view state shape this plan removes.
- `desktop/src/renderer/src/components/workspace-sidebar-conversation-row.tsx` — the existing hover-oriented duplicate-view action and multiple-view count do not create an independent conversation.
- `desktop/src/renderer/src/features/easy-button/initial-easy-button-pane.ts` — ordinary renderer creation is currently first-run bootstrap behavior.
- `desktop/src/renderer/src/App.tsx` — desktop, sidebar, and voice-credential Settings entry points currently focus a `settings-dom` workspace surface.
- `desktop/src/renderer/src/workspace-layout/settings-pane-request.ts` and `workspace-dom-surfaces.tsx` — Settings is currently constructed and rendered inside pane chrome.
- `desktop/src/renderer/src/components/settings-navigation.ts` — targeted voice settings currently dispatch a DOM event carrying a pane request.
- `desktop/src/renderer/src/workspace-layout/WorkspaceLayoutArea.tsx` — workspace surface-focus handling, pane-event handling, native-view occlusion, and global workspace input meet at the cutover boundary.
- `desktop/src/renderer/src/workspace-layout/workspace-toolbar.tsx` and `surface-dom-content.ts` — new-frame and empty-frame choices currently model Settings as a raw surface and omit conversation creation.
- `internal/workspaceui/types.go` — the Go owner currently includes `settings-dom`; Easy Button panes require conversation bindings but do not yet require those bindings to be unique.
- `desktop/src/generated/backend.ts` — generated workspace unions currently mirror the Go-owned Settings surface and must only change through regeneration.
- `desktop/tests/electron/settings-pane-workflow.test.mjs` and `workflows.mjs` — the registered production workflow currently proves pane creation instead of full-page navigation.
- `internal/narration/output.go` and `output_schema.go` — current user-visible size limits and strict schema ownership.
- `internal/narration/caller.go` — current narrator instructions define sparse output but not the proposed plain-language contract.
- `desktop/tests/electron/fixtures/fake-topic-codex-app-server.mjs` — fake narration currently reinforces sequence-oriented meta prose.
- `internal/speech/openai_client_synthesis.go` — OpenAI synthesis currently omits `speed`.
- `internal/speech/openaischema/openapi.yaml` — OpenAI speech speed supports `0.25` through `4.0` and defaults to `1.0`.
- `desktop/src/renderer/src/features/global-speech/app-shell-speech-playback-controller.ts` — renderer playback consumes synthesized audio without an owned speech cadence.
- `desktop/tests/electron/speech-transcription-provider-fixture.mjs` — the production-path provider fixture already captures synthesis JSON and can prove the new rate.
- `scripts/test_topic_conversation_workflows.sh` — canonical deterministic and live topic-conversation workflow gate.

## Non-goals

- Conversation renaming or AI-generated titles.
- A user-configurable speech-speed setting.
- Role-specific master and narrator speech rates.
- Changing narrator voices, speech models, audio formats, or arbitration policy.
- Redesigning the Highlight rail or hiding poor source text with CSS.
- Redesigning Settings content or its existing sections and controls.
- Opening Settings in a separate operating-system window.
- Rewriting the workspace compositor or changing Browser/diagnostic surface policies.
- Changing internal narrator checkpoint compression.
