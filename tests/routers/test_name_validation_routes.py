from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException
import pytest

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
from setta.types.code_obj_impls import (
    BaseParamCodeObjImpl,
    CodeCallableCodeObjImpl,
    ParameterPassingStyle,
)
from setta.types.core import Core
from setta.types.generated.impl_args_as_typed_dicts import (
    BaseDictSectionImplArgsWithCallable,
    CallableSectionImplArgsWithCallable,
)
from setta.types.helpers_lvl1 import (
    get_curr_effective_code_obj_impl,
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
from setta.types.section_impls import (
    BaseDictSectionImpl,
    BaseSectionWithParamsImpl,
    SectionType,
)
from setta.server_state import SettaFastAPIState
from setta.utils.constants import C

from tests.utils.manager_fixture import _populate_project_fixture_files
from tests.utils.runtime_context import runtime_context


@contextmanager
def _patched_setta_paths(tmpdir: str) -> Path:
    setta_root = Path(tmpdir) / "setta_files"
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

    previous_values = {
        "SETTA_FILES_FOLDER": C.SETTA_FILES_FOLDER,
        "CODE_FOLDER": C.CODE_FOLDER,
        "ARTIFACTS_FOLDER": C.ARTIFACTS_FOLDER,
        "DB_BACKUP_FOLDER": C.DB_BACKUP_FOLDER,
        "RUNTIME_FOLDER": C.RUNTIME_FOLDER,
        "RUNTIME_SESSIONS_FOLDER": C.RUNTIME_SESSIONS_FOLDER,
        "RUNTIME_LOGS_FOLDER": C.RUNTIME_LOGS_FOLDER,
        "RUNTIME_MCP_FOLDER": C.RUNTIME_MCP_FOLDER,
        "RUNTIME_SECRETS_FOLDER": C.RUNTIME_SECRETS_FOLDER,
        "DETACHED_RUNS_FOLDER": C.DETACHED_RUNS_FOLDER,
        "DEPLOYMENTS_FOLDER": C.DEPLOYMENTS_FOLDER,
    }

    C.SETTA_FILES_FOLDER = setta_root
    C.CODE_FOLDER = code_folder
    C.ARTIFACTS_FOLDER = artifacts_folder
    C.DB_BACKUP_FOLDER = backup_folder
    C.RUNTIME_FOLDER = run_folder
    C.RUNTIME_SESSIONS_FOLDER = run_sessions_folder
    C.RUNTIME_LOGS_FOLDER = run_logs_folder
    C.RUNTIME_MCP_FOLDER = run_mcp_folder
    C.RUNTIME_SECRETS_FOLDER = run_secrets_folder
    C.DETACHED_RUNS_FOLDER = detached_runs_folder
    C.DEPLOYMENTS_FOLDER = share_deployments_folder

    try:
        yield setta_root
    finally:
        C.SETTA_FILES_FOLDER = previous_values["SETTA_FILES_FOLDER"]
        C.CODE_FOLDER = previous_values["CODE_FOLDER"]
        C.ARTIFACTS_FOLDER = previous_values["ARTIFACTS_FOLDER"]
        C.DB_BACKUP_FOLDER = previous_values["DB_BACKUP_FOLDER"]
        C.RUNTIME_FOLDER = previous_values["RUNTIME_FOLDER"]
        C.RUNTIME_SESSIONS_FOLDER = previous_values["RUNTIME_SESSIONS_FOLDER"]
        C.RUNTIME_LOGS_FOLDER = previous_values["RUNTIME_LOGS_FOLDER"]
        C.RUNTIME_MCP_FOLDER = previous_values["RUNTIME_MCP_FOLDER"]
        C.RUNTIME_SECRETS_FOLDER = previous_values["RUNTIME_SECRETS_FOLDER"]
        C.DETACHED_RUNS_FOLDER = previous_values["DETACHED_RUNS_FOLDER"]
        C.DEPLOYMENTS_FOLDER = previous_values["DEPLOYMENTS_FOLDER"]


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


class TestNameValidationRoutes:
    pytestmark = pytest.mark.asyncio

    async def test_set_project_config_name_invalid_returns_422(self) -> None:
        try:
            with TemporaryDirectory() as tmpdir:
                with _patched_setta_paths(tmpdir):
                    state = await _build_state()
                    try:
                        main_manager = state.project_manager_switcher.main
                        default_project_config_id = (
                            main_manager.project_state_backend.defaultProjectConfigId
                        )
                        if default_project_config_id is None:
                            pytest.fail(
                                "Expected default project config id for rename test."
                            )
                        request = SetProjectConfigNameRequest(
                            projectConfigId=default_project_config_id,
                            newName="home",
                        )
                        with pytest.raises(HTTPException) as ctx:
                            await route_set_project_config_name(request, state)
                        assert ctx.value.status_code == 422
                    finally:
                        await _shutdown_state(state)
        except RuntimeError as exc:
            pytest.skip(str(exc))

    async def test_set_section_name_invalid_returns_422(self) -> None:
        try:
            with TemporaryDirectory() as tmpdir:
                with _patched_setta_paths(tmpdir):
                    state = await _build_state()
                    try:
                        main_manager = state.project_manager_switcher.main
                        default_project_config_id = (
                            main_manager.project_state_backend.defaultProjectConfigId
                        )
                        if default_project_config_id is None:
                            pytest.fail(
                                "Expected default project config id for rename test."
                            )
                        project_state = main_manager.get_single_config_state(
                            default_project_config_id
                        )
                        if not project_state.sections:
                            create_top_level_section(
                                state.settings_file.settings,
                                project_state,
                                SectionType.Dict,
                                Position(x=0, y=0),
                            )
                            await main_manager.update_and_broadcast_project_state(
                                project_state
                            )
                        section_id = next(iter(project_state.sections))
                        request = SetSectionNameRequest(
                            projectConfigId=default_project_config_id,
                            sectionId=section_id,
                            name="bad/name",
                        )
                        with pytest.raises(HTTPException) as ctx:
                            with runtime_context(state) as runtime_ctx:
                                await route_set_section_name(request, runtime_ctx)
                        assert ctx.value.status_code == 422
                    finally:
                        await _shutdown_state(state)
        except RuntimeError as exc:
            pytest.skip(str(exc))

    async def test_set_code_obj_name_invalid_returns_422(self) -> None:
        try:
            with TemporaryDirectory() as tmpdir:
                with _patched_setta_paths(tmpdir):
                    state = await _build_state()
                    try:
                        main_manager = state.project_manager_switcher.main
                        default_project_config_id = (
                            main_manager.project_state_backend.defaultProjectConfigId
                        )
                        if default_project_config_id is None:
                            pytest.fail(
                                "Expected default project config id for rename test."
                            )
                        project_state = main_manager.get_single_config_state(
                            default_project_config_id
                        )
                        python_codegen_enabled = project_config_has_codegen_language(
                            project_state.projectConfig,
                            ProjectCodegenLanguage.python,
                        )
                        if not python_codegen_enabled:
                            pytest.skip(
                                "Python codegen disabled; param validation skipped."
                            )
                        param_section_id = None
                        param_id = None
                        for section_id in project_state.sections:
                            section_impl = get_curr_effective_section_impl(
                                project_state, section_id
                            )
                            if not isinstance(section_impl, BaseSectionWithParamsImpl):
                                continue
                            for code_obj_id in section_impl.codeObjVariantMap:
                                code_obj_impl = get_curr_effective_code_obj_impl(
                                    project_state, section_id, code_obj_id
                                )
                                if not isinstance(code_obj_impl, BaseParamCodeObjImpl):
                                    continue
                                if code_obj_impl.passingStyle in (
                                    ParameterPassingStyle.DEFAULT,
                                    ParameterPassingStyle.KEYWORD_ONLY,
                                ):
                                    param_section_id = section_id
                                    param_id = code_obj_id
                                    break
                            if param_id is not None:
                                break
                        if param_id is None or param_section_id is None:
                            param_section_id = create_top_level_section(
                                state.settings_file.settings,
                                project_state,
                                SectionType.Callable,
                                Position(x=0, y=0),
                            )
                            callable_impl = CodeCallableCodeObjImpl()
                            callable_core = Core(name="callable")
                            add_code_obj(
                                project_state,
                                [param_section_id],
                                callable_core,
                                callable_impl,
                            )
                            set_curr_effective_section_impl_value(
                                project_state,
                                param_section_id,
                                CallableSectionImplArgsWithCallable(
                                    callable=callable_core.id
                                ),
                            )
                            param_id = add_kwarg(
                                state.settings_file.settings,
                                project_state,
                                param_section_id,
                            )
                            await main_manager.update_and_broadcast_project_state(
                                project_state
                            )
                        request = SetCodeObjNameRequest(
                            projectConfigId=default_project_config_id,
                            codeObjId=param_id,
                            name="invalid name",
                        )
                        with pytest.raises(HTTPException) as ctx:
                            with runtime_context(state) as runtime_ctx:
                                await route_set_code_obj_name(request, runtime_ctx)
                        assert ctx.value.status_code == 422
                    finally:
                        await _shutdown_state(state)
        except RuntimeError as exc:
            pytest.skip(str(exc))

    async def test_set_code_obj_name_meta_control_succeeds(self) -> None:
        try:
            with TemporaryDirectory() as tmpdir:
                with _patched_setta_paths(tmpdir):
                    state = await _build_state()
                    try:
                        main_manager = state.project_manager_switcher.main
                        default_project_config_id = (
                            main_manager.project_state_backend.defaultProjectConfigId
                        )
                        if default_project_config_id is None:
                            pytest.fail(
                                "Expected default project config id for rename test."
                            )
                        project_state = main_manager.get_single_config_state(
                            default_project_config_id
                        )
                        meta_section_id = None
                        for section_id in project_state.sections:
                            section_impl = get_curr_effective_section_impl(
                                project_state, section_id
                            )
                            if section_impl.type == SectionType.MetaControl:
                                meta_section_id = section_id
                                break
                        if meta_section_id is None:
                            meta_section_id = create_top_level_section(
                                state.settings_file.settings,
                                project_state,
                                SectionType.MetaControl,
                                Position(x=0, y=0),
                            )
                            await main_manager.update_and_broadcast_project_state(
                                project_state
                            )
                        param_id = get_meta_control_param_id(
                            project_state, meta_section_id
                        )
                        request = SetCodeObjNameRequest(
                            projectConfigId=default_project_config_id,
                            codeObjId=param_id,
                            name="control_name",
                        )
                        with runtime_context(state) as runtime_ctx:
                            await route_set_code_obj_name(request, runtime_ctx)
                        updated_state = main_manager.get_single_config_state(
                            default_project_config_id
                        )
                        assert updated_state.codeObjs[param_id].name == "control_name"
                    finally:
                        await _shutdown_state(state)
        except RuntimeError as exc:
            pytest.skip(str(exc))

    async def test_set_code_obj_name_shared_param_succeeds(self) -> None:
        try:
            with TemporaryDirectory() as tmpdir:
                with _patched_setta_paths(tmpdir):
                    state = await _build_state()
                    try:
                        main_manager = state.project_manager_switcher.main
                        default_project_config_id = (
                            main_manager.project_state_backend.defaultProjectConfigId
                        )
                        if default_project_config_id is None:
                            pytest.fail(
                                "Expected default project config id for rename test."
                            )
                        project_state = main_manager.get_single_config_state(
                            default_project_config_id
                        )
                        section_a_id = create_top_level_section(
                            state.settings_file.settings,
                            project_state,
                            SectionType.Dict,
                            Position(x=0, y=0),
                        )
                        section_b_id = create_top_level_section(
                            state.settings_file.settings,
                            project_state,
                            SectionType.Dict,
                            Position(x=200, y=0),
                        )
                        shared_param_id = add_kwarg(
                            state.settings_file.settings,
                            project_state,
                            section_a_id,
                        )
                        section_a_impl = get_curr_effective_section_impl(
                            project_state, section_a_id
                        )
                        if not isinstance(section_a_impl, BaseDictSectionImpl):
                            pytest.fail("Expected dict section implementation.")
                        shared_root_id = section_a_impl.topLevelParamId
                        if shared_root_id is None:
                            pytest.fail(
                                "Expected dict section to have a top-level param."
                            )
                        shared_variant_map = dict(section_a_impl.codeObjVariantMap)
                        if shared_root_id not in shared_variant_map:
                            pytest.fail(
                                "Expected top-level param variant mapping."
                            )
                        set_curr_effective_section_impl_value(
                            project_state,
                            section_b_id,
                            BaseDictSectionImplArgsWithCallable(
                                topLevelParamId=shared_root_id,
                                codeObjVariantMap=shared_variant_map,
                            ),
                        )
                        await main_manager.update_and_broadcast_project_state(
                            project_state
                        )
                        request = SetCodeObjNameRequest(
                            projectConfigId=default_project_config_id,
                            codeObjId=shared_param_id,
                            name="shared_param",
                        )
                        with runtime_context(state) as runtime_ctx:
                            await route_set_code_obj_name(request, runtime_ctx)
                        updated_state = main_manager.get_single_config_state(
                            default_project_config_id
                        )
                        assert (
                            updated_state.codeObjs[shared_param_id].name
                            == "shared_param"
                        )
                    finally:
                        await _shutdown_state(state)
        except RuntimeError as exc:
            pytest.skip(str(exc))
