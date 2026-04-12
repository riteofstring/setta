Date: 2026-04-13
Lane: direct `/settings` backend load path
Fixture: `real_settings_manager()` warm load

Command:

```bash
source activate.sh && python - <<'PY'
import asyncio
from contextlib import AsyncExitStack
from unittest.mock import patch

from tests.project_state.test_load_project_config_timing import TIMING_LOG_LABELS
from tests.utils.manager_fixture import real_settings_manager

async def main() -> None:
    async with AsyncExitStack() as exit_stack:
        fixture = await exit_stack.enter_async_context(real_settings_manager())
        manager = fixture.manager
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        await manager.load_project_config(project_config_id)
        with patch('setta.project_state.base_project_manager.logger.info') as info_mock:
            await manager.load_project_config(project_config_id)
        _message, *args = info_mock.call_args.args
        for label, value in zip(TIMING_LOG_LABELS, args, strict=True):
            if isinstance(value, float):
                value = round(value, 3)
            print(f'{label}={value}')

asyncio.run(main())
PY
```

Observed warm-load timing:

```text
project_config_id=3ee72992-583a-4583-9381-3950cffef158
did_init=False
section_count=46
convert_ms=352.405
convert_collect_ids_ms=102.474
convert_slice_state_ms=6.11
convert_project_state_ms=242.793
convert_project_state_model_overhead_ms=3.995
convert_project_state_content_validation_ms=238.595
convert_project_state_singleton_sections_ms=23.863
convert_project_state_active_ids_ms=0.005
convert_project_state_parent_section_map_ms=29.551
convert_project_state_shown_param_ids_ms=133.566
convert_project_state_shown_param_ids_effective_section_lookup_ms=28.859
convert_project_state_shown_param_ids_get_param_ids_to_show_ms=103.984
convert_project_state_required_decoded_images_ms=26.164
convert_project_state_code_file_bindings_ms=25.446
convert_project_state_layout_validation_ms=0.202
init_ms=0.05
init_update_ms=0.0
validation_cache_hit=True
validation_resolve_ms=0.003
validation_broadcast_ms=0.026
validation_ms=0.029
total_ms=352.492
```

Reading:

- `shown_param_ids` remains the dominant content validator on this warm
  settings fixture at about `133.6ms` of `238.6ms`.
- Most of that bucket is inside `get_param_ids_to_show(...)`
  (`~104.0ms`), not section/variant effective-impl resolution
  (`~28.9ms`).
- The next backend attribution slice should stay inside
  `get_param_ids_to_show(...)`, starting with one bounded split between
  hierarchy traversal and `filter_for_ui_display(...)`.
