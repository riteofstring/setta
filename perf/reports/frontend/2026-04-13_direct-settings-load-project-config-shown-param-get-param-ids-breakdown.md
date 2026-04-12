# Direct `/settings` warm-load shown-param `get_param_ids_to_show(...)` breakdown

Date: 2026-04-13
Worktree: `pixijs-graph`
Lane: direct authenticated `/settings` warm-load backend timing

## Verification command

```bash
source activate.sh && python - <<'PY'
import asyncio
from contextlib import AsyncExitStack
from unittest.mock import patch

from tests.project_state.test_load_project_config_timing import get_timing_log_values
from tests.utils.manager_fixture import real_settings_manager


async def main() -> None:
    async with AsyncExitStack() as stack:
        fixture = await stack.enter_async_context(real_settings_manager())
        manager = fixture.manager
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        await manager.load_project_config(project_config_id)
        with patch("setta.project_state.base_project_manager.logger.info") as info_mock:
            await manager.load_project_config(project_config_id)
        timing = get_timing_log_values(info_mock)
        for key in [
            "convert_project_state_shown_param_ids_ms",
            "convert_project_state_shown_param_ids_effective_section_lookup_ms",
            "convert_project_state_shown_param_ids_get_param_ids_to_show_ms",
            "convert_project_state_shown_param_ids_traverse_hierarchy_ms",
            "convert_project_state_shown_param_ids_filter_for_ui_display_ms",
        ]:
            print(f"{key}={timing[key]:.6f}")


asyncio.run(main())
PY
```

## Readout

- `convert_project_state_shown_param_ids_ms`: `113.870950`
- `convert_project_state_shown_param_ids_effective_section_lookup_ms`: `24.395399`
- `convert_project_state_shown_param_ids_get_param_ids_to_show_ms`: `89.138328`
- `convert_project_state_shown_param_ids_traverse_hierarchy_ms`: `76.719991`
- `convert_project_state_shown_param_ids_filter_for_ui_display_ms`: `3.891721`

## Reading

- On the current warm `/settings` fixture, `get_param_ids_to_show(...)` is now clearly dominated by `traverse_hierarchy(...)`, not by `filter_for_ui_display(...)`.
- The new filter bucket is small enough that more backend micro-attribution on this specific filter shape would be churn.
- Compared with the prior `get_param_ids_to_show(...)` aggregate readout (`~104ms` in the handoff), the current total bucket is lower at `~89ms`, which is consistent with the filter rewrite removing repeat subtree scans and the quadratic top-level pass.
- The next backend-only pass should target `traverse_hierarchy(...)` only if fresh end-to-end evidence still shows backend warm-load as the user-facing blocker on direct `/settings`; otherwise this lane should pivot back to the earliest product-facing gate.
