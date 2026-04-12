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
                'init_ms': round(args[7], 3),
                'init_update_ms': round(args[8], 3),
                'validation_cache_hit': args[9],
                'validation_resolve_ms': round(args[10], 3),
                'validation_broadcast_ms': round(args[11], 3),
                'validation_ms': round(args[12], 3),
                'total_ms': round(args[13], 3),
            }
        )

asyncio.run(main())
PY
```

Observed warm-load timing:

```text
project_config_id=fd7ffce4-d84a-4d3f-8d84-e8c09cb72c6c
did_init=False
section_count=46
convert_ms=294.997
convert_collect_ids_ms=87.171
convert_slice_state_ms=5.051
convert_project_state_ms=200.789
init_ms=0.052
init_update_ms=0.0
validation_cache_hit=True
validation_resolve_ms=0.003
validation_broadcast_ms=0.029
validation_ms=0.032
total_ms=295.09
```

Reading:

- Warm direct `/settings` load is now dominated by `ProjectStateSingleConfig(...)`
  materialization inside `convert_backend_to_single_config(...)`, not by the
  recursive id collection pass.
- On this fixture, recursive section/code-object traversal is about `87ms`,
  dictionary slicing is about `5ms`, and final single-config model assembly is
  about `201ms`.
- The next backend isolation slice should inspect why constructing the final
  `ProjectStateSingleConfig` model costs most of the remaining warm-load time.
