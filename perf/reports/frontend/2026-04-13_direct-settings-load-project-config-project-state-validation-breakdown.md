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
        print(
            {
                'project_config_id': args[0],
                'did_init': args[1],
                'section_count': args[2],
                'convert_ms': round(args[3], 3),
                'convert_collect_ids_ms': round(args[4], 3),
                'convert_slice_state_ms': round(args[5], 3),
                'convert_project_state_ms': round(args[6], 3),
                'convert_project_state_model_overhead_ms': round(args[7], 3),
                'convert_project_state_content_validation_ms': round(args[8], 3),
                'convert_project_state_layout_validation_ms': round(args[9], 3),
                'init_ms': round(args[10], 3),
                'init_update_ms': round(args[11], 3),
                'validation_cache_hit': args[12],
                'validation_resolve_ms': round(args[13], 3),
                'validation_broadcast_ms': round(args[14], 3),
                'validation_ms': round(args[15], 3),
                'total_ms': round(args[16], 3),
            }
        )

asyncio.run(main())
PY
```

Observed warm-load timing:

```text
project_config_id=d408717f-9465-4209-8b2d-9f6acbf7d483
did_init=False
section_count=46
convert_ms=239.776
convert_collect_ids_ms=58.654
convert_slice_state_ms=4.928
convert_project_state_ms=175.167
convert_project_state_model_overhead_ms=4.93
convert_project_state_content_validation_ms=170.062
convert_project_state_layout_validation_ms=0.174
init_ms=0.078
init_update_ms=0.0
validation_cache_hit=True
validation_resolve_ms=0.003
validation_broadcast_ms=0.029
validation_ms=0.032
total_ms=239.896
```

Reading:

- The expensive part of `ProjectStateSingleConfig(...)` on this warm settings
  fixture is not project-config or chat-windowing attachment.
- `convert_project_state_layout_validation_ms` is effectively noise here
  (`~0.17ms`), while the content-derived validators account for almost the
  entire constructor bucket (`~170ms` of `~175ms`).
- The residual constructor overhead outside explicit post-build validators is
  small on this fixture (`~4.9ms`).
- The next backend isolation slice should therefore stay inside the
  content-derived validation methods, starting with whichever of singleton,
  parent-map, shown-param, image, or code-file-binding validation dominates on
  the warm `/settings` path.
