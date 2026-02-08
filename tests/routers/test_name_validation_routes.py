from collections.abc import AsyncIterator
from contextlib import contextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
import pytest
import pytest_asyncio

from setta.lsp.managers import stop_file_watcher, stop_lsps
from setta.project_state.project_manager_types import (
    SetCodeObjNameRequest,
    SetSectionNameRequest,
)
from setta.routers.project_manager import (
    route_set_code_obj_name,
    route_set_section_name,
)
from setta.routers.projects import (
    SetProjectConfigNameRequest,
    route_set_project_config_name,
)
from setta.types.code_obj_impls import CodeCallableCodeObjImpl
from setta.types.core import Core
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseDictSectionImplArgsWithCallable,
    CallableSectionImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_section_impl,
    set_curr_effective_section_impl_value,
)
from setta.types.helpers_lvl2 import (
    add_code_obj,
    add_kwarg,
    create_top_level_section,
    get_meta_control_param_id,
)
from setta.types.project_config import (
    ProjectCodegenLanguage,
    Position,
    project_config_has_codegen_language,
)
from setta.types.section_impls import BaseDictSectionImpl, SectionType
from setta.server_state import SettaFastAPIState
from setta.types.id import ID
from tests.utils.manager_fixture import _populate_project_fixture_files
from tests.utils.runtime_context import runtime_context
from tests.utils.setta_paths import temporary_setta_paths


@contextmanager
def _patched_setta_paths(tmpdir: str) -> Path:
    root = Path(tmpdir)
    setta_root = root / "setta_files"
    code_folder = setta_root / "code"
    artifacts_folder = setta_root / "artifacts"
    backup_folder = setta_root / "backups"
    run_folder = setta_root / "runtime"
    run_sessions_folder = run_folder / "sessions"
    run_logs_folder = run_folder / "logs"
    run_mcp_folder = run_folder / "mcp"
    run_secrets_folder = run_folder / "secrets"
    detached_runs_folder = run_folder / "detached_runs"
    share_deployments_folder = setta_root / "share_deployments"

    for path in (
        code_folder,
        artifacts_folder,
        backup_folder,
        run_sessions_folder,
        run_logs_folder,
        run_mcp_folder,
        run_secrets_folder,
        detached_runs_folder,
        share_deployments_folder,
    ):
        path.mkdir(parents=True, exist_ok=True)

    _populate_project_fixture_files(setta_root)
    with temporary_setta_paths(
        workspace_root=root,
        setta_files_root=setta_root,
    ):
        yield setta_root


def _get_default_project_config_id(state: SettaFastAPIState) -> ID:
    main_manager = state.project_manager_switcher.main
    project_config_id = main_manager.project_state_backend.defaultProjectConfigId
    if project_config_id is None:
        pytest.fail("Expected default project config id for rename test.")
    return project_config_id


async def _build_state() -> SettaFastAPIState:
    app = FastAPI()
    state = SettaFastAPIState(
        app,
        enable_mcp_connections=False,
        enable_language_server=False,
    )
    await state.wait_until_ready()
    return state


async def _shutdown_state(state: SettaFastAPIState) -> None:
    if state.project_manager_switcher:
        for manager in state.project_manager_switcher.project_managers:
            manager.shutdown()
    if state.specific_file_watcher:
        state.specific_file_watcher.stop()
    if not state.mcp_client.disabled:
        await state.mcp_client.stop()
    if state.lsps and state.lsp_readers:
        await stop_lsps(state.lsps, state.lsp_readers)
    if state.lsp_writers:
        stop_file_watcher(state.lsp_writers)


async def _create_param_for_rename_test(
    state: SettaFastAPIState, project_config_id: ID
) -> ID:
    main_manager = state.project_manager_switcher.main
    project_state = main_manager.get_single_config_state(project_config_id)
    python_codegen_enabled = project_config_has_codegen_language(
        project_state.projectConfig,
        ProjectCodegenLanguage.python,
    )
    if not python_codegen_enabled:
        pytest.fail("Expected python codegen enabled for param validation test.")

    param_section_id = create_top_level_section(
        state.settings_file.settings,
        project_state,
        SectionType.Callable,
        Position(x=0, y=0),
    )
    callable_impl = CodeCallableCodeObjImpl()
    callable_core = Core(name="callable")
    add_code_obj(project_state, [param_section_id], callable_core, callable_impl)
    set_curr_effective_section_impl_value(
        project_state,
        param_section_id,
        CallableSectionImplArgsWithCallable(callable=callable_core.id),
    )
    param_id = add_kwarg(
        state.settings_file.settings,
        project_state,
        param_section_id,
    )
    await main_manager.update_and_broadcast_project_state(project_state)
    return param_id


@pytest_asyncio.fixture
async def state_env(tmp_path: Path) -> AsyncIterator[SettaFastAPIState]:
    with _patched_setta_paths(str(tmp_path)):
        state = await _build_state()
        try:
            yield state
        finally:
            await _shutdown_state(state)


class TestNameValidationRoutes:
    pytestmark = pytest.mark.asyncio

    async def test_project_config_name_validation_rejects_invalid_name(
        self, state_env: SettaFastAPIState
    ) -> None:
        project_config_id = _get_default_project_config_id(state_env)
        request = SetProjectConfigNameRequest(
            projectConfigId=project_config_id,
            newName="home",
        )
        with pytest.raises(HTTPException) as ctx:
            await route_set_project_config_name(request, state_env)
        assert ctx.value.status_code == 422

    async def test_section_name_validation_rejects_invalid_name(
        self, state_env: SettaFastAPIState
    ) -> None:
        main_manager = state_env.project_manager_switcher.main
        project_config_id = _get_default_project_config_id(state_env)
        project_state = main_manager.get_single_config_state(project_config_id)
        section_id = create_top_level_section(
            state_env.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(x=0, y=0),
        )
        await main_manager.update_and_broadcast_project_state(project_state)

        request = SetSectionNameRequest(
            projectConfigId=project_config_id,
            sectionId=section_id,
            name="bad/name",
        )
        with pytest.raises(HTTPException) as ctx:
            with runtime_context(state_env) as runtime_ctx:
                await route_set_section_name(request, runtime_ctx)
        assert ctx.value.status_code == 422

    async def test_code_obj_name_validation_rejects_invalid_name(
        self, state_env: SettaFastAPIState
    ) -> None:
        project_config_id = _get_default_project_config_id(state_env)
        param_id = await _create_param_for_rename_test(state_env, project_config_id)
        request = SetCodeObjNameRequest(
            projectConfigId=project_config_id,
            codeObjId=param_id,
            name="invalid name",
        )
        with pytest.raises(HTTPException) as ctx:
            with runtime_context(state_env) as runtime_ctx:
                await route_set_code_obj_name(request, runtime_ctx)
        assert ctx.value.status_code == 422

    async def test_meta_control_param_rename_succeeds(
        self, state_env: SettaFastAPIState
    ) -> None:
        main_manager = state_env.project_manager_switcher.main
        project_config_id = _get_default_project_config_id(state_env)
        project_state = main_manager.get_single_config_state(project_config_id)
        meta_section_id = create_top_level_section(
            state_env.settings_file.settings,
            project_state,
            SectionType.MetaControl,
            Position(x=0, y=0),
        )
        await main_manager.update_and_broadcast_project_state(project_state)

        param_id = get_meta_control_param_id(project_state, meta_section_id)
        request = SetCodeObjNameRequest(
            projectConfigId=project_config_id,
            codeObjId=param_id,
            name="control_name",
        )
        with runtime_context(state_env) as runtime_ctx:
            await route_set_code_obj_name(request, runtime_ctx)

        updated_state = main_manager.get_single_config_state(project_config_id)
        assert updated_state.codeObjs[param_id].name == "control_name"

    async def test_shared_param_rename_updates_all_refs(
        self, state_env: SettaFastAPIState
    ) -> None:
        main_manager = state_env.project_manager_switcher.main
        project_config_id = _get_default_project_config_id(state_env)
        project_state = main_manager.get_single_config_state(project_config_id)

        section_a_id = create_top_level_section(
            state_env.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(x=0, y=0),
        )
        section_b_id = create_top_level_section(
            state_env.settings_file.settings,
            project_state,
            SectionType.Dict,
            Position(x=200, y=0),
        )
        shared_param_id = add_kwarg(
            state_env.settings_file.settings,
            project_state,
            section_a_id,
        )
        section_a_impl = get_curr_effective_section_impl(project_state, section_a_id)
        if not isinstance(section_a_impl, BaseDictSectionImpl):
            pytest.fail("Expected dict section implementation.")
        shared_root_id = section_a_impl.topLevelParamId
        if shared_root_id is None:
            pytest.fail("Expected dict section to have a top-level param.")
        shared_variant_map = dict(section_a_impl.codeObjVariantMap)
        if shared_root_id not in shared_variant_map:
            pytest.fail("Expected top-level param variant mapping.")

        set_curr_effective_section_impl_value(
            project_state,
            section_b_id,
            BaseDictSectionImplArgsWithCallable(
                topLevelParamId=shared_root_id,
                codeObjVariantMap=shared_variant_map,
            ),
        )
        await main_manager.update_and_broadcast_project_state(project_state)

        request = SetCodeObjNameRequest(
            projectConfigId=project_config_id,
            codeObjId=shared_param_id,
            name="shared_param",
        )
        with runtime_context(state_env) as runtime_ctx:
            await route_set_code_obj_name(request, runtime_ctx)

        updated_state = main_manager.get_single_config_state(project_config_id)
        assert updated_state.codeObjs[shared_param_id].name == "shared_param"
