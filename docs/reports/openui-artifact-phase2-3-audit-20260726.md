# OpenUI Artifact Phases 2-3 Audit - 2026-07-26

## Result

The combined Phase 2 artifact-contract/storage replacement and Phase 3
generation/validation/publication cutover are complete. The current Go, SQLite,
HTTP, generated TypeScript, provider, narrator, Director projection, and
production read/render paths all use one compiler-validated artifact document.
The applicable deterministic matrix and the complete ChatGPT-authenticated live
provider matrix are green.

Phase 4 remains in progress only at the two renderer-cutover pieces the contract
replacement forced to land. This audit did not start its preview gallery,
browser overlay, navigation, prefetching, telemetry, or performance work.

## Scope

The requested minimum range was
`3ed68d2936f4fe57e7e01f4ee21ade8069b5fd5c..4200d5a1e9ebeffe98c45a611e6ef418456b6f1d`,
plus this audit's fixes. History inspection found no earlier Phase 2 or Phase 3
implementation commit and no mid-phase restart: `3ed68d293` closed Phase 1 and
`4200d5a1e` is the single combined Phase 2-3 implementation commit.

Before verification, one static pass inspected:

- the plan, phase boundary, commit history, Phase 0 and Phase 1 evidence, and
  the unavailable driven-Electron baseline record
- the Go domain contract, compiler acceptance, dynamic-tool schema and failure
  mapping, atomic transaction, delivery-attempt reduction, snapshots, side
  context, narrator context, and route summaries
- the in-place SQLite schema, every artifact insert and scan, the clean-data
  version check, HTTP registry ownership, and regenerated protocol 103
  TypeScript contract
- provider receipts and image-generation mapping, Director lifecycle identity,
  HTTP/main/preload/IPC reads, the lazy OpenUI renderer boundary, keyboard focus,
  loading and failure semantics, and renderer chunk reachability
- every changed fixture and deterministic/live assertion, including the
  production Electron workflow through backend, store, HTTP, main, preload,
  IPC, and renderer

Repository searches found no old artifact-kind symbol, typed payload, nullable
payload column, renderer branch, migration, compatibility alias, or dual-read
path in the implementation. The sole old-kind input string outside historical
reports is a negative strict-tool test proving that `kind` is rejected. There
was no earlier current-phase evidence that postdated `4200d5a1e`, so the phase
required fresh broad deterministic and live verification.

## Audit Corrections

The audit fixed the following current-phase issues:

- Bound model-authored `FileReference` nodes to the active turn's authorized
  workspace. The tool now walks the compiled document, requires every referenced
  path to resolve to an existing regular file under the canonical workspace,
  rejects missing workspace authority, missing files, directories, and symlink
  escapes with a retryable field error, and performs that work before artifact
  or emitted-trajectory IDs are allocated.
- Applied the same filesystem boundary to provider-generated media. The
  workspace and saved path are canonicalized, only real regular files contained
  by the workspace can become artifacts, and the grammar-owned synthesized
  document compiles before an artifact ID is allocated.
- Made grammar-owned string-literal generation reject invalid UTF-8 rather than
  allowing `encoding/json` to replace invalid bytes and silently address a
  different path.
- Removed the narrator router's `"unreadable artifact document"` fallback.
  Stored-document corruption now aborts context materialization with the
  artifact identity and compiler error instead of entering authoritative model
  context as invented summary text.
- Restored full shared identity checking at the Director read boundary after
  removal of `kind`: ID, conversation, turn/run, title, and creation time must
  agree between projected metadata and the full artifact payload.
- Strengthened the required Electron workflow to wait for and assert content
  inside the lazily loaded OpenUI document container, rather than accepting a
  loaded metadata shell as proof that the document rendered.
- Corrected the plan's snapshot wording. Full artifact writes and reads compile
  the document; bounded conversation snapshots intentionally carry and validate
  metadata only.

The first broad run then exposed deterministic fixtures that reported
generated-media paths without creating the files. The shared Go fake provider
and Electron fake provider now materialize every file they claim to have
generated. The Electron assertion also stopped assuming that Setta's run ID and
the provider turn ID used in the generated filename are identical.

## Focused Verification

The compiler source builder, model file-reference validation, generated-media
containment, and narrator route summary checks passed:

```sh
./scripts/go.sh test \
  ./internal/conversation/artifactdoc \
  ./internal/conversation \
  ./internal/narration \
  -run 'Test(FileReferenceSource|GeneratedMedia|EmitArtifactToolValidatesFileReferencesBeforeMintingIDs|ArtifactFileReferenceWorkspaceValidationRejectsMissingAuthorityAndSymlinkEscapes|ConversationRouteArtifacts)' \
  -count=1
```

After the initial broad failure, the exact three Go workflows passed:

```sh
./scripts/go.sh test ./internal/conversation \
  -run '^(TestServicePublishesCommittedAgentLifecycleToNarrationObserver|TestServiceInjectsTypedAuthoritativeSideContextBeforeActivation|TestServiceRunsDurableConversationCommandsAndReload)$' \
  -count=1
```

The exact Director Electron workflow passed after its fixture and assertion
corrections:

```sh
node desktop/tests/electron/run-workflows.mjs \
  --workflow director-command-center \
  --skip-build
```

Artifact:
`.recordings/director-command-center/20260727T050408421Z/`.

## Broad Deterministic Matrix

The initial combined invocation was:

```sh
./scripts/test_topic_conversation_workflows.sh
```

Its production build and all 75 desktop test files with 656 tests passed. The
Go matrix exposed the three generated-file fixtures above, and the Director
workflow exposed the provider-turn/Setta-run filename assumption. The command
continued through the live matrix, whose results are recorded below.

After the narrow workflows were green, one final applicable broad deterministic
invocation passed:

```sh
./scripts/test_topic_conversation_workflows.sh --deterministic-only
```

It passed:

- production desktop typecheck and Electron/Vite build
- `internal/director`, `internal/conversation`, `internal/httpapi`, and
  `internal/runtime`
- 75 desktop test files and 656 tests
- Director command-center Electron workflow
- Director local-voice Electron workflow
- microphone-permissions Electron workflow

The production build emitted the command center and
`SettaArtifactRenderer` as separate chunks, preserving the lazy-load boundary:
the initial renderer chunk was 566.99 kB and the artifact renderer chunk was
1,293.51 kB.

Final deterministic artifacts:

- `.recordings/director-command-center/20260727T050454264Z/`
- `.recordings/director-command-center-local-voice/20260727T050512229Z/`
- `.recordings/microphone-permissions/20260727T050524094Z/`

## Live Provider Matrix

Local Codex ChatGPT auth was already available. The initial combined broad
command excluded `OPENAI_API_KEY` and ran the complete live matrix once after
the last production-code change:

- agent protocol: passed
- active-side isolation: passed
- topic-conversation workflow, controls/restart, and artifact publication:
  passed
- Director command center: passed

The live suites were not rerun after deterministic fixture-only corrections.

## Phase Boundary

Every available Phase 2-3 gate is satisfied. The driven-Electron pre-change
performance baseline remains recorded as a release gate and was not retried.
No missing credentials, privileges, GUI application, service, or remote access
was sought.
