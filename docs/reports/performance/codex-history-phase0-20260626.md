# Codex History Deduplication Phase 0

## Scope

Phase 0 validates the protocol and product assumptions needed before replacing
Setta's duplicated Codex transcript persistence. No old transcript persistence
path was deleted in this phase.

## Deterministic Fake Protocol Evidence

Measurement and validation command:

```sh
./scripts/go.sh test ./internal/chat -run 'TestCodexHistoryPhase0(ValidatesSettaDiscoveryAndWritableSurfaces|TurnsListRequiresExperimentalCapability|MeasuresSyntheticHistoryLatency)|TestCodexHarnessMapsStreamingTurn|TestCodexHarnessRunsSemanticCartographerStructuredTask|TestCodexHarnessStartsThreadWithDynamicTools|TestCodexHarnessDoesNotSendDynamicToolsOnResume|TestCodexHarnessExecutesIdleGoalCommandRPC|TestCodexHarnessBeginsGoalContinuationFromCommandRPC|TestCodexHarnessGoalEditOpensEditor|TestCodexHarnessGoalPauseRequiresExistingGoal|TestCodexHarnessExecutesModelListRPCAgainstLinkedThread|TestCodexHarnessExecutesModelSetRPCAgainstLinkedThread|TestCodexHarnessExecutesReasoningEffortSetRPCAgainstLinkedThread' -v
```

Result on 2026-06-26: pass.

The deterministic fake app-server test proves Setta sends, captures, decodes,
filters, indexes, and compares the protocol fields correctly when the provider
returns the expected contract shape. It does not prove real Codex persists
optional provider metadata or returns stable history item IDs after reload.

The fake app-server coverage is:

- `thread/start` from Setta visible user chats with `threadSource: "setta:user"`.
- `thread/start` from Setta workflow/internal chats with
  `threadSource: "setta:workflow"`.
- Semantic cartographer structured task starts with
  `threadSource: "setta:semantic_cartographer"` as provider metadata.
- `thread/list` with exact workspace `cwd` and `sourceKinds: ["appServer"]`
  returns Setta-created app-server threads and excludes same-CWD CLI and VS Code
  threads plus app-server threads from a different CWD.
- A Setta-owned non-transcript thread index is the source of chat membership and
  user/workflow/internal classification. Unknown Codex app-server threads
  returned by `thread/list` are ignored unless they have explicit Setta index
  records.
- User, workflow, and semantic cartographer/internal lists come from explicit
  Setta index surfaces, then hydrate indexed thread IDs from Codex history.
- If a Setta index write fails after `thread/start`, Setta fails chat creation
  and does not start the first turn.
- Setta thread index and activity overlay records omit user prompt text,
  assistant response text, and duplicated Codex-persisted transcript item
  bodies.
- The fake `thread/read(includeTurns=true)` and `thread/turns/list` return turn
  and item IDs matching fake streaming IDs, which proves Setta's capture and
  decoding code path. Real Codex item-ID mismatch is recorded as provider
  behavior and handled by the Setta activity overlay.
- `thread/turns/list` requires the `experimentalApi` initialization capability
  and fails specifically when the capability is missing.
- Writable thread APIs are available through the JSON-RPC path:
  `thread/name/set`, `thread/goal/get`, `thread/goal/set`,
  `thread/goal/clear`, `thread/settings/update`, and the queued
  `thread/settings/updated` notification.

## Installed Runtime Live Compatibility Evidence

Validation command:

```sh
./scripts/go.sh test ./internal/chat -run TestCodexHistoryPhase0LiveProviderValidation -count=1 -v
```

Result on 2026-06-26: fail against the installed PATH Codex runtime. This is an
installed-runtime compatibility failure for that binary, not evidence against
the revised design.

Runtime metadata for the failing run:

- Codex binary selected from PATH: `/Users/kevin/.local/bin/codex`.
- Resolved binary target:
  `/Users/kevin/.codex/packages/standalone/releases/0.142.0-aarch64-apple-darwin/bin/codex`.
- `codex --version`: `codex-cli 0.142.0`.
- Installed `codex app-server --help` does not expose `--session-source`.
- Setta vendored protocol snapshot:
  `67009bc53ffc684eaf235c6186df890d35259240`.
- Local reference Codex repo:
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex`.
- Local reference Codex repo commit:
  `ab16046c88b2ea9e9af849ab6662129c6becb151`.
- The reference app-server source at that commit exposes
  `--session-source` and defaults it to `vscode`. That likely explains why the
  installed runtime persisted the Setta-created live thread as `source:"vscode"`
  and why `sourceKinds:["appServer"]` returned no rows.

The live validation uses ChatGPT auth, unsets `OPENAI_API_KEY`, creates a
temporary `CODEX_HOME` seeded only with local Codex auth/config inputs, sets a
temporary `SETTA_APP_DATA_DIR`, starts a real `codex app-server`, creates a
Setta-marked thread, runs a command/approval turn, shuts that app-server down,
and reads history back through a fresh real app-server process using the same
temporary `CODEX_HOME`.

Observed streaming activity from the command turn:

- `turn/started` and `turn/completed`.
- Four `item/started` and `item/completed` IDs: user message, command execution,
  assistant message, and reasoning.
- `item/commandExecution/requestApproval` plus `serverRequest/resolved`.
- No `item/commandExecution/outputDelta` was emitted in the sampled run.

Provider results after restart:

- `thread/read(includeTurns=true)` and `thread/turns/list(itemsView:"full")`
  both returned the live turn ID, so turn identity survived persistence.
- None of the four live item IDs reconciled with persisted history from either
  `thread/read` or `thread/turns/list`.
- The command approval's item ID and request ID were absent from persisted
  history. Setta's activity overlay must own approval request identity and
  command/approval presentation details for this provider shape.
- `thread/list` with exact `cwd` plus `sourceKinds: ["appServer"]` returned no
  rows for the live Setta-started thread.
- `thread/list` with `cwd` only, default source filtering, or no filters did
  return the thread, but its provider source was `"vscode"` and
  `threadSource` was absent.

Conclusion: the installed PATH runtime does not satisfy the Phase 0 runtime
requirements because it lacks explicit app-server session-source support. Setta
must not rely on arbitrary user-installed Codex versions for de-duplicated
history.

The repo live-auth probe reports that Codex ChatGPT auth is available locally,
so live Codex workflow gates should run during final verification for this
change.

## Reference Runtime Live Validation

Reference repo:
`/Users/kevin/Documents/AppDevelopment/reference_repos/codex`.

Reference commit:
`ab16046c88b2ea9e9af849ab6662129c6becb151`.

Reference build results:

- `cargo build -p codex-cli` produced
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/target/debug/codex`.
  `codex --version` reports `codex-cli 0.0.0`. This CLI subcommand path does
  not expose `--session-source` in `codex app-server --help`.
- `cargo build -p codex-app-server --bin codex-app-server` produced
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/target/debug/codex-app-server`.
  `codex-app-server --version` reports `codex-app-server 0.0.0`. This
  standalone app-server exposes `--session-source <SOURCE>`.

Validation command:

```sh
SETTA_CODEX_HISTORY_PHASE0_LIVE=1 SETTA_CODEX_BIN=/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/target/debug/codex-app-server ./scripts/go.sh test ./internal/chat -run TestCodexHistoryPhase0LiveProviderValidation -count=1 -v
```

Result on 2026-06-26: pass against the reference-built standalone app-server
under the revised Phase 0 requirements. The previous installed-runtime source
filtering failure was runtime-entrypoint/version dependent.

Runtime metadata for the passing reference run:

- `SETTA_CODEX_BIN`:
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/target/debug/codex-app-server`.
- Resolved binary target:
  `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/target/debug/codex-app-server`.
- Invocation mode: direct app-server.
- Version: `codex-app-server 0.0.0`.
- Reference repo commit:
  `ab16046c88b2ea9e9af849ab6662129c6becb151`.
- `--session-source` support: yes.
- Started with explicit app-server session source: yes,
  `--listen stdio:// --session-source app-server`.

Observed streaming activity from the command turn:

- `turn/started` and `turn/completed`.
- Four `item/started` and `item/completed` IDs: user message, command execution,
  assistant message, and reasoning.
- `item/commandExecution/requestApproval` plus `serverRequest/resolved`.
- No `item/commandExecution/outputDelta` was emitted in the sampled run.

Required provider behavior after restart:

- `thread/list` with exact `cwd` plus `sourceKinds: ["appServer"]` returned the
  Setta-created thread as `source:"appServer"`. The installed-runtime
  `source:"vscode"` failure is therefore runtime-entrypoint/version dependent.
- Default source listing and cwd-only listing did not return the app-server
  thread in this run. Source filtering should require an explicit app-server
  session source; default listing is not a replacement for that filter.
- `thread/read(includeTurns=true)` and `thread/turns/list(itemsView:"full")`
  both returned the live turn ID, so turn identity survived persistence.
- Live command/approval activity exposed turn-scoped provider/request metadata
  sufficient to key Setta overlay records, for example
  `threadId:turnId:command:<callId>` and
  `threadId:turnId:approvalRequest:<requestId>`.

Observed provider limitations, now design inputs rather than blockers:

- `thread/list` did not return the Setta `threadSource` marker. The listed
  thread had `threadSource:""` instead of `threadSource:"setta:user"`. Setta
  compensates with its own non-transcript thread index; deleting `~/.setta` is a
  Setta data reset and does not reconstruct the chat list from Codex alone.
- None of the four live item IDs reconciled with persisted history from either
  `thread/read` or `thread/turns/list`. Setta's activity overlay must key
  command/tool/approval details by Codex thread ID, Codex turn ID, and a
  turn-scoped live provider/request ID, not by presumed persisted item IDs.
- The command approval's item ID and request ID were absent from persisted
  history. Setta's activity overlay must own approval request identity and
  command/approval presentation details for this provider shape.

Conclusion: the reference-built standalone app-server satisfies the revised
Phase 0 required runtime behavior. Phase 0 validates the design inputs, but no
Phase 1 protocol registration or Phase 3 storage deletion was performed in this
work.

## Synthetic Latency

These numbers measure fake app-server and Setta JSON-RPC plumbing overhead only.
They do not represent real Codex history storage, scan, or provider behavior.

Synthetic deterministic history shape:

- 1,000 app-server threads in one workspace.
- One transcript thread with 120 turns.
- Six persisted items per turn.
- Page size of 50 for `thread/list` and 40 for transcript pages.
- JSON-RPC path goes through `codexapp.Manager` and the stdio fake app-server.

Measured result from the focused test run:

- `thread/list` first page: 1.250625 ms.
- first transcript page from `thread/turns/list`: 0.704500 ms.
- older transcript page from `thread/turns/list`: 0.772875 ms.

## Real Codex Latency

Measured in the failing installed-runtime live validation after restarting the
real app-server:

- exact `thread/list` page with `cwd` plus `sourceKinds: ["appServer"]`:
  0.828333 ms, returning zero rows because the provider persisted the thread as
  `"vscode"`.
- first transcript page from `thread/turns/list`, page size 1 on a two-turn
  thread: 1.301666 ms.
- older transcript page from `thread/turns/list`, page size 1 on a two-turn
  thread: 1.372083 ms.

These real timings are useful as installed-runtime protocol overhead
observations, but they are not a scalability baseline because the provider
compatibility probe failed before a large-history measurement could be
meaningful.

Measured in the passing reference-runtime live validation after restarting the
real app-server:

- exact `thread/list` page with `cwd` plus `sourceKinds: ["appServer"]`:
  3.127958 ms, returning the thread as `source:"appServer"` with empty
  `threadSource`.
- first transcript page from `thread/turns/list`, page size 1 on a two-turn
  thread: 5.666917 ms.
- older transcript page from `thread/turns/list`, page size 1 on a two-turn
  thread: 11.098167 ms.

These reference-runtime timings are real provider observations for a tiny
history after restart. They are still not a scalability baseline because Phase
0 did not run a large real-Codex history measurement.

Initial budgets for replacing local reads:

- keep first visible history list load under 250 ms on a warm local app-server
  for a 1,000-thread workspace page.
- keep first transcript page under 250 ms for 40 turns.
- keep older transcript page loads under 250 ms for 40 turns.
- if real Codex history exceeds these budgets, use process lifetime, request
  coalescing, cursor paging, renderer memory caches, and the Setta thread index.
  Do not write a second transcript cache.

## Product Decisions Locked For Later Phases

- If linked-thread model or reasoning updates fail through
  `thread/settings/update` or the queued `thread/settings/updated` notification,
  Setta must fail specifically and choose either pre-thread-only changes or a new
  Codex thread. It must not silently persist divergent linked-thread model state
  in Setta overlay.
- History unavailable UX should be a typed provider-unavailable error with a
  retry action in the history/transcript view. It must not read old Setta
  transcript files as a degraded mode.
- Activity overlay presentation keys must be turn-scoped and ID-based:
  `codex:<threadId>:<turnId>:<activityKind>:<liveProviderOrRequestId>`.
  Use persisted Codex item IDs only when the selected runtime returns the same
  IDs from history. If a live activity has no Codex item ID, request ID, or
  other explicit stable provider key, it is not eligible for persisted overlay
  presentation until that key exists. Event arrival order is not a persisted
  key.
- With the observed reference-runtime behavior, the overlay must not rely on
  persisted Codex item IDs for command/tool/approval details. It can be keyed by
  turn plus live provider/request IDs.
- Setta chat membership and user/internal classification come from the Setta
  thread index, not Codex `threadSource`, cwd, title, transcript content, or
  other inferred provider metadata.
