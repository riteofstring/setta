# LLM Simplification Plan (pre-refactor)

Goal: clear the current regressions so the main refactor can resume.

## Do before returning to the refactor
- Done: Streaming persistence updated—`_StreamingTranscriptRecorder` now uses a ~0.5s interval and a `persist_snapshot` helper so crash recovery and `tests/llm/test_chat_persistence.py` pass.
- Tool-call completion lifecycle: after tool results, emit a final `ResponseCompleted` (or avoid forcing `waitingForResponse=true` in `llmToolResult`) so chats exit STREAMING; keep frontend state in sync with that completion.
- Regression tests: cover the tool-call completion/status transition (snapshot interval path covered by the persistence test).

## Everything else
- Structural simplifications (pipeline layering, config normalization, broader reducer/tests) live in `docs/llm_refactor_plan.md` and should proceed with the refactor once the above blockers ship.
