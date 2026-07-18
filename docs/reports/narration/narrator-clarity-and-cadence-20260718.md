# Narrator Clarity and Cadence Baseline

Plan: `docs/plans/easy-button-multi-pane-narrator-clarity-20260718.md`

## 2026-07-18 Baseline

This entry records repository-local current behavior before the Easy Button, Settings page, narrator prose, and speech cadence cutover. It uses current source, focused tests, and deterministic Electron fixtures. Live OpenAI synthesis and GUI/native-view screenshot capture are external release gates and should not be retried as implementation-loop work without those external capabilities already available.

Recent plan history was checked before this entry. The only file-specific plan commit was `b9c7e4440 docs: plan workspace and narration UX improvements`, so there was no prior implementation attempt for this plan file to repeat.

### Current Narrator Contract

| Field | Current hard maximum | Source |
| --- | ---: | --- |
| `topicDescriptor` | 320 chars | `internal/narration/output.go` |
| `currentFocus` | 320 chars | `internal/narration/output.go` |
| `milestones[]` item | 240 chars | `internal/narration/output.go` |
| `finalSummary` | 1,200 chars | `internal/narration/output.go` |
| `statusReply` | 1,200 chars | `internal/narration/output.go` |

The strict schemas currently enforce those bounds but do not describe field purpose or plain-language expectations. The instruction builders currently ask for a stable focus, sparse phase-change milestone, terminal summary, or concise status reply, but they do not require outcome-led language, user relevance, omission of Setta bookkeeping, or direct failure wording.

### Curated Corpus

| Case | Current output source | Current text | Chars | Words | Internal-mechanism leakage | Complete enough | Tells what changed |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| Nontechnical work | Deterministic focus projection shape with nontechnical objective | "Plan a quiet weekend meal for friends." | 38 | 7 | No | Yes | Partly; it names the topic but no change |
| Explicitly technical work | `internal/narration/caller_test.go` focus fixture | "Implementing the narrator provider boundary." | 44 | 5 | Yes | Partly | No; it names implementation machinery |
| Real milestone | `desktop/tests/electron/fixtures/fake-topic-codex-app-server.mjs` projection fixture | "Narrator evaluated projector catch-up through sequence 3." | 57 | 7 | Yes | No | No; it reports evaluation mechanics |
| No meaningful phase change | Fake provider when prior milestones exist or simultaneous completion steering is present | "" | 0 | 0 | No | Yes | Yes; silence is appropriate |
| Approval waiting | Fake status reply fixture | "The primary topic agent is still working and has not been steered or interrupted." | 81 | 14 | No | Partly | Partly; it describes activity but not the approval/blocker |
| Failure | `internal/narration/failure_test.go` degradation fixture | "Narrator model is unavailable." | 30 | 4 | Yes | Yes | Yes; direct failure wording |
| Terminal completion with caveat | `internal/narration/caller_test.go` invalid terminal fixture | "This summary cannot cover a terminal event the narrator did not observe." | 72 | 12 | Yes | Yes | Yes; caveat is explicit |
| Status request | `internal/narration/caller_test.go` status fixture | "The narrator provider boundary is being verified." | 49 | 7 | Yes | Partly | No; it reports internal verification |

Baseline finding: current examples are short enough to pass today's validators, but shortness does not make them user-facing. Several deterministic outputs normalize "Narrator", "provider boundary", "projection", "terminal event", or "sequence" even when the user task is not about those implementation details.

### Speech Cadence

Repository-local baseline:

- `internal/speech/openai_client_synthesis.go` sends `model`, `input`, `voice`, and `response_format` to `/audio/speech`; it does not send `speed`.
- `internal/speech/openaischema/openapi.yaml` documents speech `speed` for `createSpeech`, including the `0.25` to `4.0` provider range and default behavior.
- `internal/speech/service.go` calls the provider with separate text and voice arguments, so there is currently no speech-domain synthesis input that can carry an owned rate.
- No global-speech renderer code currently sets `HTMLAudioElement.playbackRate`; playback uses synthesized audio at its native cadence.

External release gate: fixed representative master and narrator samples at `1.0` and `1.2`, WAV durations, and listening notes still need to be collected with an available OpenAI synthesis environment. This is release evidence, not implementation-loop work.

### Settings and Workspace Layout

Repository-local baseline:

- `internal/workspaceui/types.go` still owns `SurfaceKindSettingsDOM` with discriminator value `settings-dom`.
- `desktop/src/generated/backend.ts` still mirrors `settings-dom` in the generated `SurfaceKind` contract.
- `desktop/src/renderer/src/workspace-layout/settings-pane-request.ts` creates Settings as an `OpenPaneRequest` titled "Settings" with subtitle "workspace settings".
- `desktop/src/renderer/src/App.tsx` opens Settings and targeted voice settings by focusing the `settings-dom` workspace surface.
- `desktop/src/renderer/src/workspace-layout/workspace-scene.ts` still sets pane limits of `browser: 10`, `easy-button: 10`, `empty-frame: 10`, and `settings-dom: 1`.
- `desktop/tests/electron/settings-pane-workflow.test.mjs` records the current behavior as pane-based: before Settings, the fixture waits for `paneCount === 2` without `settings-dom`; after clicking Settings, it waits for `paneCount === 3`, focused `settings-dom`, and a ready settings panel; after opening Browser, it waits for `paneCount === 4` and a visible Browser pane.
- `desktop/src/renderer/src/workspace-layout/benchmark-scene.ts` still seeds `settings-dom` into benchmark panes and labels it "real settings".
- `desktop/src/renderer/src/workspace-layout/runtime-policy.ts` still categorizes `settings-dom` as an always-live workspace surface that freezes during movement.

External release gate: visual/native Browser-view evidence for the current Settings pane and Browser pane screenshots should be collected with the existing Electron workflow when a GUI-capable environment is available. The source and workflow assertions above are the repository-local baseline for implementation planning.

### Locked Decisions

Implementation should use the plan's product contract without reopening these choices:

- UI labels: `New conversation`, `Conversation`, `Settings`, and `Back to workspace`.
- Settings route semantics: Settings is a shell page, not a workspace pane or modal; returning restores the untouched workspace.
- Field ceilings: `topicDescriptor` 160, `currentFocus` 240, milestone item 200, `finalSummary` 480, `statusReply` 400, with at most one milestone.
- Speech cadence: master and narrator synthesis use the speech-domain rate `1.2`.
- Placement semantics: new conversation creation has explicit new-pane and exact-empty-frame destinations; existing conversations focus or restore their one pane.
- Failure behavior: preflight failure leaves layout unchanged; create failure shows the backend error; created-but-not-presented conversations remain durable with a specific visible error.

Post-change evidence should be appended to this same report during the verification phase, after the implementation changes the current behavior.
