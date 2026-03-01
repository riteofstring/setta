# Phase 2 Tail: Value-Edit Routes Skip Watcher Refresh

## Scope
- Keep full `update()`/codegen behavior for value-edit routes.
- Skip watcher re-registration by passing `updateFileWatcher=False` when file bindings cannot change.
- Routes updated in this pass:
  - `set_code`
  - `set_text_block_text`
  - `set_prompt_template`
  - `set_prompt_inputs`
  - `set_prompt_format`

## Benchmark Setup
- Environment: local dev machine, same shell/session for before/after.
- Project shape: `build_callable_project_state(300)` plus one top-level `Code`, `TextBlock`, and `Prompt` section.
- Measurement: async wall-clock around route call + `finish_pending_operations()`.
- Warmup: 1 iteration per route.
- Measured iterations: 4 per route.

## Results

| Route | Before median (ms) | After median (ms) | Delta (ms) | Delta (%) |
| --- | ---: | ---: | ---: | ---: |
| `set_code` | 495.47 | 367.92 | -127.55 | -25.74% |
| `set_text_block_text` | 1478.10 | 1311.27 | -166.83 | -11.29% |
| `set_prompt_template` | 2527.65 | 2258.37 | -269.28 | -10.65% |
| `set_prompt_inputs` | 2409.29 | 2270.41 | -138.88 | -5.76% |

## Notes
- Largest relative win in this pass is `set_code` (~25.7% median reduction).
- Prompt/text routes also show consistent median reductions.
- This pass targets backend CPU overhead only; route semantics and broadcast behavior are preserved by tests.
