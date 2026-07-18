# Topic Conversations Phase 2 Active-Fork Characterization

**Date:** 2026-07-11

**Pinned Codex source:** `2b9c05046038c038ec6bddb9db7d11394995372d`

**Live Codex CLI:** `codex-cli 0.144.1`

## Result

The ChatGPT-authenticated live test ran with `OPENAI_API_KEY` removed and
established the active-turn `thread/fork` behavior required by the side
conversation design.

While the parent was executing `sleep 12`, both an ephemeral fork and a durable
audit fork returned before the parent completed. Each response contained two
turns and four public items. Both responses:

- contained the active user request
- contained the public assistant commentary emitted before the command
- did not contain the in-flight `commandExecution` item

The durable audit response marked the cloned active turn `interrupted`. The
ephemeral `thread/fork` response projected that source turn as `inProgress`.
This is consistent with the pinned implementation: the child core is created
with `ForkSnapshot::Interrupted`, while the pathless ephemeral API response is
populated directly from the copied source history. Setta therefore does not use
the ephemeral response status as its parent-state authority.

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

The missing in-flight command is a proven public-context gap. Phase 6 adds one
typed `SideInFlightContextFrame` before the side user's first turn. It is
materialized from Setta's authoritative normalized trajectory and contains the
source sequence, objective and steering, plan, active activity metadata,
approval state, and artifact metadata. It does not contain private reasoning,
raw command/tool output, or heuristic summaries.

## Phase 6 full-lifecycle re-verification

**Re-verified:** 2026-07-13

The live conversation-service test exercised the production store, service,
and Codex runtime through topic creation, a completed baseline turn, an active
parent command, ephemeral side creation, boundary and typed-context injection,
two side turns, parent completion, isolation checks, and provider-thread
disposal.

The full lifecycle reproduced the response distinction above. The typed frame
carried the running objective and the `sleep 20` activity omitted by the raw
fork history, allowing the side agent to return
`SETTA_LIVE_SIDE_CONTEXT_OK`. After the parent completed, the side agent
returned `SETTA_LIVE_SIDE_HISTORY_ISOLATED` when asked whether inherited
assistant history contained the verified later parent marker. The parent
provider thread and current Setta parent trajectory contained neither side
request, injected boundary/context, nor side reply, and disposal returned
`unsubscribed` for the ephemeral provider thread.

## Verification

```text
env -u OPENAI_API_KEY SETTA_LIVE_CODEX=1 ./scripts/go.sh test -v ./internal/agent \
  -run TestLiveCodexRuntimeThreadLifecycleAndActiveForkSnapshot \
  -count=1 -timeout=5m

--- PASS: TestLiveCodexRuntimeThreadLifecycleAndActiveForkSnapshot

env -u OPENAI_API_KEY SETTA_LIVE_CODEX=1 ./scripts/go.sh test -v \
  ./internal/conversation \
  -run TestLiveConversationServiceActiveSideLifecycle \
  -count=1 -timeout=6m

--- PASS: TestLiveConversationServiceActiveSideLifecycle
```
