# Codex Goal Operation Phase 0 Characterization - 2026-06-28

## Direct App-Server Source Of Truth

Command:

```sh
./scripts/go.sh test ./internal/chat -run 'TestCodexAppServerGoal' -v
```

Result: passed with three intentional skips for states the direct app-server cannot force deterministically.

Observed provider behavior:

- Raw `thread/goal/set` against an existing paused goal preserves the existing goal record. The second set changed the objective from `phase 0 direct first objective` to `phase 0 direct replacement objective` while preserving `createdAt`.
- Clear-before-active-set emitted `thread/goal/cleared`, then active `thread/goal/updated`, then runtime `turn/started`.
- Goal cancellation ordering required an explicit paused goal update before `turn/interrupt`; the direct run emitted paused `thread/goal/updated` before interrupted `turn/completed`.
- Direct app-server rejected `thread/goal/set` for an unknown thread.

Skipped direct states:

- Continuation ordering: app-server has no deterministic test control for forcing an automatic active-goal continuation inside a bounded live run.
- Terminal goal-before/after-completion ordering: app-server has no deterministic test control for forcing both terminal ordering variants.
- Busy, ephemeral, and missing-path thread shapes: app-server does not expose stable direct controls for constructing these states without a live run race.

## Deterministic Fixtures

The fake protocol modes cover only finality-affecting edge shapes that direct app-server characterization cannot force repeatably:

- multi-turn ordering variants
- idle gap between physical turns
- terminal-before/after-completion and active-before/after-completion updates
- pre-sink buffering and overflow
- duplicate terminal/finish signals
- provider clear during a goal operation
- stale/cancel race shape requiring pause-before-interrupt
- busy, ephemeral, and missing-path thread shapes
- background terminal routing during idle gaps and during a later physical turn

The raw set-preserves-old fake mode is anchored by the direct raw `thread/goal/set` app-server test above.

## Focused Characterization Checks

Command:

```sh
./scripts/go.sh test ./internal/chat -run 'TestCodexAppServerGoal|TestCodexHarnessGoal(Set|Operation)|TestCodexHarnessBackgroundTerminalClassificationSharedByGoalAndStandaloneRouters|TestServiceGoalOperation' -timeout 30s -v
```

Result: passed after review conversion to freeze-not-red. Direct app-server tests passed or narrowly skipped; deterministic harness/service tests freeze the current gaps and each frozen assertion names the later phase that flips it.

Frozen current gaps:

- `/goal` does not clear the provider goal before setting a new objective.
- Goal operation waiting completes after the first physical turn instead of the logical goal operation.
- Duplicate terminal/finish signals do not have an exactly-once logical finish path.
- Intermediate completion ends an idle-gap goal operation.
- Terminal and non-terminal update ordering variants are not handled as logical finality.
- Busy, ephemeral, and missing-path threads are not rejected before provider mutation.
- Cancellation calls `turn/interrupt` before pausing the goal.
- Service runs complete after the first physical turn instead of remaining running across an idle gap until terminal provider state.
- Service persistence records only `goal turn A. ` and an active goal for the multi-turn provider sequence.
- A second thread turn blocks on harness-global `turnMu` instead of failing before provider mutation.
- An unrelated normal turn blocks while the goal operation is idle.
- Pre-sink overflow does not fail with the designed buffer overflow error.
- Background terminal output/completion from an earlier physical turn is not routed across idle-gap or later-physical-turn windows.
- The connection-scoped background terminal router accepts unclassified output that the session cross-turn router rejects, proving classification is split instead of shared.

Passing guardrails in this focused run:

- Direct raw app-server set/update, unknown-thread rejection, start notification order, and cancel notification order.
- Provider clear during a current physical turn completes the run and persists the cleared local goal.
- Pre-sink in-order replay.
- Direct tests skip when the `codex` binary or ChatGPT auth is unavailable.

## Electron Coverage

Added deterministic Codex protocol workflow coverage under `desktop/tests/electron/chat-workflows.test.mjs`. The fake Codex app-server emits two physical goal turns for `/goal phase0 codex multi turn`, and the workflow freezes the current production Electron/main/preload/renderer/HTTP/store behavior: only the first physical turn is persisted before the run completes and the goal remains active.

Syntax checks run:

```sh
node --check desktop/tests/electron/fixtures/fake-codex-app-server.mjs
node --check desktop/tests/electron/chat-workflows.test.mjs
pnpm -C desktop exec prettier --write tests/electron/fixtures/fake-codex-app-server.mjs tests/electron/chat-workflows.test.mjs
```

Focused Electron characterization run:

```sh
node desktop/tests/electron/chat-workflows.test.mjs --codex-protocol-only --keep-artifacts
```

Result after review: passed with freeze-not-red assertions. The goal operation creates a production Codex goal run through Electron/main/preload/renderer/HTTP/store paths, persists only `Goal turn A.`, links the conversation to `turn_goal_a`, leaves the goal status `active`, and completes the Setta run before observing `Goal turn B.` plus `complete`. Phase 3 flips this assertion.
