# LLM Simplification Plan (pre-refactor)

Goal: clear the current regressions so the main refactor can resume.

## Do before returning to the refactor
- Done: Streaming persistence updated—`_StreamingTranscriptRecorder` now uses a ~0.5s interval and a `persist_snapshot` helper so crash recovery and `tests/llm/test_chat_persistence.py` pass.
- Done: Tool-call completion lifecycle fixed—after tool results we emit a final `ResponseCompleted` so chats exit STREAMING and the frontend state closes out the response.
- Done: Regression tests cover the tool-call completion/status transition (`tests/llm/test_stream_state_machine.py` asserts a completion after the final tool result; snapshot interval path covered by the persistence test).

## Everything else
- Structural simplifications (pipeline layering, config normalization, broader reducer/tests) live in `docs/llm_refactor_plan.md` and should proceed with the refactor once the above blockers ship.
