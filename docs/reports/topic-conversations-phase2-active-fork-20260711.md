# Topic Conversations Phase 2 Active-Fork Characterization

**Date:** 2026-07-11

**Pinned Codex source:** `2b9c05046038c038ec6bddb9db7d11394995372d`

**Live Codex CLI:** `codex-cli 0.144.1`

## Result

The ChatGPT-authenticated live test ran with `OPENAI_API_KEY` removed and
established the active-turn `thread/fork` behavior required by the side
conversation design.

While the parent was executing `sleep 12`, both an ephemeral fork and a durable
audit fork returned before the parent completed. Their snapshots contained four
turns and eight public items. The cloned active turn:

- contained the active user request
- contained the public assistant commentary emitted before the command
- was marked `interrupted` in the child snapshot
- did not contain the in-flight `commandExecution` item

The parent continued and completed normally. Reading the durable audit child
after parent completion returned the identical fork snapshot; the parent's
later `ACTIVE_PARENT_FINISHED` assistant message was absent. An explicit turn
inside the ephemeral child also answered `NO` when asked whether inherited
assistant history contained that later marker. The ephemeral child rejected
`thread/read(includeTurns=true)` with the explicit provider error
`ephemeral threads do not support includeTurns`.

A control fork at the last completed parent turn contained two completed turns,
confirming that `lastTurnId` bounds history as expected.

## Design consequence

The missing in-flight command is a proven public-context gap. Phase 7 must add
one typed `SideInFlightContextFrame` before the side user's first turn. It is
materialized from Setta's authoritative normalized trajectory and contains the
source sequence, objective and steering, plan, active activity metadata,
approval state, and artifact metadata. It must not contain private reasoning,
raw command/tool output, or heuristic summaries.

## Verification

```text
env -u OPENAI_API_KEY SETTA_LIVE_CODEX=1 ./scripts/go.sh test -v ./internal/agent \
  -run TestLiveCodexRuntimeThreadLifecycleAndActiveForkSnapshot \
  -count=1 -timeout=5m

--- PASS: TestLiveCodexRuntimeThreadLifecycleAndActiveForkSnapshot (35.39s)
```
