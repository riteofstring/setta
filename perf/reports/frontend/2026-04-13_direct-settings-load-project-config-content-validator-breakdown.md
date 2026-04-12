Date: 2026-04-13
Lane: direct `/settings` backend load path
Fixture: `real_settings_manager()` warm load

Command:

```bash
source activate.sh && python - <<'PY'
import asyncio
from contextlib import AsyncExitStack
from unittest.mock import patch

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
        labels = [
            'project_config_id',
            'did_init',
            'section_count',
            'convert_ms',
            'convert_collect_ids_ms',
            'convert_slice_state_ms',
            'convert_project_state_ms',
            'convert_project_state_model_overhead_ms',
            'convert_project_state_content_validation_ms',
            'convert_project_state_singleton_sections_ms',
            'convert_project_state_active_ids_ms',
            'convert_project_state_parent_section_map_ms',
            'convert_project_state_shown_param_ids_ms',
            'convert_project_state_required_decoded_images_ms',
            'convert_project_state_code_file_bindings_ms',
            'convert_project_state_layout_validation_ms',
            'init_ms',
            'init_update_ms',
            'validation_cache_hit',
            'validation_resolve_ms',
            'validation_broadcast_ms',
            'validation_ms',
            'total_ms',
        ]
        for label, value in zip(labels, args, strict=True):
            if isinstance(value, float):
                value = round(value, 3)
            print(f'{label}={value}')

asyncio.run(main())
PY
```

Observed warm-load timing:

```text
project_config_id=52395c76-695d-410e-9a04-bf657e7e2937
did_init=False
section_count=46
convert_ms=266.853
convert_collect_ids_ms=70.171
convert_slice_state_ms=5.497
convert_project_state_ms=190.133
convert_project_state_model_overhead_ms=3.405
convert_project_state_content_validation_ms=186.572
convert_project_state_singleton_sections_ms=16.528
convert_project_state_active_ids_ms=0.007
convert_project_state_parent_section_map_ms=17.208
convert_project_state_shown_param_ids_ms=110.538
convert_project_state_required_decoded_images_ms=20.128
convert_project_state_code_file_bindings_ms=22.163
convert_project_state_layout_validation_ms=0.156
init_ms=0.056
init_update_ms=0.0
validation_cache_hit=True
validation_resolve_ms=0.003
validation_broadcast_ms=0.032
validation_ms=0.035
total_ms=266.954
```

Reading:

- `shown_param_ids` is the dominant content-derived validator on this warm
  settings fixture at about `110.5ms` of `186.6ms`.
- The secondary content validators are `code_file_bindings`
  (`~22.2ms`), `required_decoded_images` (`~20.1ms`),
  `parent_section_map` (`~17.2ms`), and `singleton_sections`
  (`~16.5ms`).
- `active_ids` is effectively noise on this path (`~0.007ms`), and layout
  validation remains negligible (`~0.16ms`).
- The next backend attribution slice should stay inside
  `validate_shown_param_ids(...)` so the remaining dominant owner is named
  more precisely before any product optimization attempt.
