# Review 3 (main...HEAD)

## Verdict
The branch changes largely make sense and look merge-ready. I did not find blocking correctness or compatibility issues in the diff vs merge base.

## Findings

1. **Low: manual restart command is not trimmed before display/use**  
   - **Where:** `frontend/src/plugins/restart.ts:160`  
   - **Concrete example:** if backend capability returns `"  setta plugins restart  "`, UI/notifications keep the surrounding whitespace.
   - **Proposed fix:** trim first, then fallback: `const command = commandRaw?.trim() || "setta";`.
   - **UX before:** command text can look malformed and copy/paste may include hidden whitespace.
   - **UX after:** clean, deterministic command text.
   - **DX before:** harder to assert exact message text and debug command mismatches.
   - **DX after:** stable output strings and clearer logs/tests.

2. **Low: backend worker stderr detail loses boundary fidelity**  
   - **Where:** `backend/setta/plugins/manager.py:1918`  
   - **Concrete example:** `_read_available_pipe_text(...)` returns `"".join(lines).strip()`, which removes leading/trailing whitespace and final newline from plugin stderr snippets included in transport errors.
   - **Proposed fix:** preserve raw join output (or only strip terminal `\n` with `rstrip("\n")` if needed).
   - **UX before:** surfaced backend plugin error details can be slightly altered.
   - **UX after:** error details more faithfully match emitted plugin stderr.
   - **DX before:** harder to correlate host errors with plugin-side logs byte-for-byte.
   - **DX after:** easier forensic debugging when plugin startup/transport fails.

## Backward-compatibility shims
I did **not** find unnecessary backward-compatibility shims in what this branch adds to `main`.

## Merge recommendation
No blocker found. I would merge after (or while accepting) the two low-severity cleanups above.
