# Direct `/settings` `load_project_config` backend breakdown

Date: 2026-04-13
Worktree: `pixijs-graph`
Lane: direct `/settings` canary load

## Scope

Bounded backend-tracing slice for the direct `/settings` canary after the
frontend loading-state work made the slow phase visible. This pass added
structured timing logs around `BaseProjectManager.load_project_config(...)`
and captured the breakdown with real manager fixtures.

## Instrumented fields

The new backend log line records:

- `project_config_id`
- `did_init`
- `section_count`
- `convert_ms`
- `init_ms`
- `init_update_ms`
- `validation_ms`
- `total_ms`

## Captured breakdown

Command:

```bash
source activate.sh && python - <<'PY'
import asyncio
from unittest.mock import patch
from tests.utils.manager_fixture import real_project_manager, real_settings_manager

async def capture(ctx_factory, label):
    async with ctx_factory() as fixture:
        manager = fixture.manager
        project_config_id = manager.project_state_backend.defaultProjectConfigId
        with patch('setta.project_state.base_project_manager.logger.info') as info_mock:
            await manager.load_project_config(project_config_id)
        first = info_mock.call_args.args
        with patch('setta.project_state.base_project_manager.logger.info') as info_mock:
            await manager.load_project_config(project_config_id)
        second = info_mock.call_args.args
        print(label)
        print('  first:', first[1:])
        print('  second:', second[1:])

async def main():
    await capture(real_settings_manager, 'settings')
    await capture(real_project_manager, 'project')

asyncio.run(main())
PY
```

Observed output:

```text
settings
  first: ('494cfe62-eab9-46a2-bbd0-362399638fe7', True, 46, 318.97012300032657, 4149.204938003095, 4149.143617003574, 3647.1309710032074, 8115.31156199635)
  second: ('494cfe62-eab9-46a2-bbd0-362399638fe7', True, 46, 285.29644600348547, 4047.7086230093846, 4047.648643012508, 3532.9977270012023, 7866.006686002947)
project
  first: ('sample-project-config', True, 0, 0.3938939917134121, 1.9012039992958307, 1.866193997557275, 0.0844610040076077, 2.3818090121494606)
  second: ('sample-project-config', False, 0, 0.4051830037496984, 0.03159001062158495, 0.0, 0.07782099419273436, 0.5171139928279445)
```

## Reading

- On the settings fixture, the dominant work is not route lookup or
  `convert_backend_to_single_config(...)`.
- The dominant owners are:
  - `maybe_init_project_config(...)` / `update(...)`: about `4.0s` to `4.1s`
  - `_broadcast_name_validation_errors(...)`: about `3.5s` to `3.6s`
- Total settings-config load time in this fixture is about `7.9s` to `8.1s`,
  which matches the slow direct `/settings` symptom closely enough to make this
  a credible owner trace.
- The second settings load still reports `did_init=True`, so the current
  settings-config path is re-entering the expensive update lane on warm loads
  instead of dropping to a cheap steady state.
- The generic project fixture does hit the intended warm path:
  second load is `did_init=False` and totals about `0.5ms`.

## Implication for next slice

The next bounded backend/product frontier should inspect why the settings
config keeps re-entering `update(...)` on warm `load_project_config(...)`
calls and whether name-validation broadcast cost can be narrowed or cached for
unchanged state on this route.
