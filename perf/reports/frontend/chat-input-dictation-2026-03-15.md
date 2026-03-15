# ChatInput Dictation Extraction

- Date: `2026-03-15`
- Slice: extract browser/provider dictation lifecycle out of `frontend/src/components/Chat/ChatInput.tsx` into `frontend/src/components/Chat/useChatInputDictation.ts`
- Verification surface: same-origin `ChatInput` harness on `http://127.0.0.1:3002/?__setta_backend_origin=http://127.0.0.1:8002`
- Normal app-shell note: the standard app shell was still blank because the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing) prevented normal boot, so CDP verification stayed on the same-origin harness.

## Before

- Earlier baseline on the harness showed:
  - `Mic` button visible
  - `Send message` button visible
  - context badge present
  - background terminal and subagent counters present in the a11y tree
  - mic toggle still switched to `Stop Mic`
- Baseline screenshot: `perf/reports/frontend/chat-input-dictation-before-2026-03-15.png`

## After

- Post-refactor harness rerun with explicit runtime activity props showed:
  - `68` total DOM nodes in the mounted harness subtree
  - `Mic` button visible before interaction
  - `Send message` button visible
  - `context left 25%` badge visible
  - `1 background terminal active` counter visible
  - `2 subagents active` counter visible
- After clicking the mic button:
  - button label changed to `Stop Mic`
  - the listening status row appeared in the accessibility tree as `LISTENING...`
- After screenshot: `perf/reports/frontend/chat-input-dictation-after-2026-03-15.png`

## Notes

- This slice was a behavior-preserving ownership split, not a UI redesign.
- The important regression guard here was stable composer chrome and stable dictation state transitions, not changing layout density.
