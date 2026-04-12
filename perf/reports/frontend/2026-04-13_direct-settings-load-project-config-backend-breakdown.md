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

## Follow-up: validation split after warm-load fixes

Date: 2026-04-13

This follow-up pass kept behavior unchanged and split the old `validation_ms`
 bucket into:

- `validation_cache_hit`
- `validation_resolve_ms`
- `validation_broadcast_ms`
- `validation_ms` (sum of the two split timings)

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
  first: ('67d5a3f5-7f19-4d3e-86fa-3f9856ecbd10', False, 46, 314.04374800331425, 0.06624999514315277, 0.0, True, 0.006689995643682778, 0.05631099338643253, 0.0630009890301153, 314.18493899400346)
  second: ('67d5a3f5-7f19-4d3e-86fa-3f9856ecbd10', False, 46, 337.38540099875536, 0.0564900110475719, 0.0, True, 0.0030700030038133264, 0.027821006369777024, 0.03089100937359035, 337.48318201105576)
project
  first: ('sample-project-config', True, 0, 0.43743400601670146, 2.7501709992066026, 2.7158010052517056, False, 0.06979099998716265, 0.019829996745102108, 0.08962099673226476, 3.2852360018296167)
  second: ('sample-project-config', False, 0, 0.3876529954141006, 0.03137100429739803, 0.0, True, 0.0024699984351173043, 0.021970001398585737, 0.02443999983370304, 0.4522439994616434)
```

Reading:

- On the current settings fixture, validation is now a warm-cache hit and is
  effectively free:
  - `validation_resolve_ms` is about `0.003ms` to `0.007ms`
  - `validation_broadcast_ms` is about `0.028ms` to `0.056ms`
  - combined `validation_ms` is about `0.03ms` to `0.06ms`
- That means the earlier multi-second `validation_ms` bucket no longer points
  at name-validation collector work on the current backend path.
- In this fixture state, `convert_backend_to_single_config(...)` is now the
  dominant steady-state owner on settings warm loads (`~314ms` to `~337ms`).
- The next backend/product frontier should follow the same direct `/settings`
  lane, but it should stop treating name-validation broadcast as the default
  owner and instead isolate the remaining `convert_backend_to_single_config(...)`
  / project-state materialization cost on the settings config.
