from pathlib import Path
from tempfile import TemporaryDirectory

import pytest
from fastapi import FastAPI, HTTPException
from pydantic import ValidationError
from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.project_state.project_manager_types import (
    AcceptRenameRefactorRequest,
    AddKwargRequest,
    AppendDrawAreaLayerItemRequest,
    ChangeParamImplRequest,
    CreateTopLevelSectionRequest,
    CreateViewModeRequest,
    CreateWindowSpaceRequest,
    DeclineRenameRefactorRequest,
    DeleteKwargRequest,
    DeleteSectionsRequest,
    DeleteViewModeRequest,
    DeleteWindowSpaceRequest,
    FormatCodeRequest,
    GetChatSectionChatIdRequest,
    GetPasswordParamValueRequest,
    GroupSectionsRequest,
    PasteSectionsRequest,
    RunCodeRequest,
    SetCallableHideParamsRequest,
    SetCallableRequest,
    SetChatSectionChatIdRequest,
    SetChartAreaDataPathRequest,
    SetChartSettingsRequest,
    SetChartTypeRequest,
    SetCodeFileBindingRequest,
    SetCodeObjDisplayNameRequest,
    SetCodeObjNameRequest,
    SetCodeRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetImageAreaImagePathRequest,
    SetListRootViewModeRequest,
    SetParamEnteredValueRequest,
    SetParentDefaultChildSectionTypeRequest,
    SetProjectChatWindowingStateRequest,
    SetSectionNameRequest,
    SetSocialUrlRequest,
    SetSpreadsheetFilePathRequest,
    SetSpreadsheetSectionSettingsRequest,
    SetTaskBoardSectionStateRequest,
    SetTextBlockMasterFontSizeRequest,
    SetTextBlockTextRequest,
    SetTypeErrorIgnoreRequest,
    SetViewModeNameRequest,
    SetWindowSpaceNameRequest,
    SetWindowSpaceSortOrderRequest,
    ToggleIsEditingViewModeRequest,
    ToggleParamSelectedRequest,
    ToggleSectionVisibilityRequest,
    ToggleViewModeTabRequest,
    ToggleViewModeUserFacingRequest,
    UngroupGroupsRequest,
    UnselectAllParamsRequest,
    UpdateParamImplConfigRequest,
)
from setta.routers.ai import GetLLMResponseRequest, route_get_llm_response
from setta.routers.dependencies import require_share_session_id
from setta.routers.llm import (
    UpdateAPIKeysRequest,
    route_get_llm_config,
    route_set_llm_api_keys,
    route_set_llm_config,
)
from setta.routers.project_manager import (
    route_accept_rename_refactor,
    route_add_kwarg,
    route_append_draw_area_layer_item,
    route_change_param_impl,
    route_create_top_level_section,
    route_create_view_mode,
    route_create_window_space,
    route_decline_rename_refactor,
    route_delete_kwarg,
    route_delete_sections,
    route_delete_view_mode,
    route_delete_window_space,
    route_format_code,
    route_get_chat_section_chat_id,
    route_get_password_param_value,
    route_group_sections,
    route_paste_sections,
    route_set_callable,
    route_set_callable_hide_params,
    route_set_chat_section_chat_id,
    route_set_chart_area_data_path,
    route_set_chart_settings,
    route_set_chart_type,
    route_set_code,
    route_set_code_file_binding,
    route_set_code_obj_display_name,
    route_set_code_obj_name,
    route_set_gen_code_prefix,
    route_set_gen_code_suffix,
    route_set_image_area_image_path,
    route_set_list_root_view_mode,
    route_set_param_entered_value,
    route_set_parent_default_child_section_type,
    route_set_project_chat_windowing_state,
    route_set_section_name,
    route_set_social_url,
    route_set_spreadsheet_file_path,
    route_set_spreadsheet_section_settings,
    route_set_task_board_section_state,
    route_set_text_block_master_font_size,
    route_set_text_block_text,
    route_set_type_error_ignore,
    route_set_view_mode_name,
    route_set_window_space_name,
    route_set_window_space_sort_order,
    route_toggle_is_editing_view_mode,
    route_toggle_param_selected,
    route_toggle_section_visibility,
    route_toggle_view_mode_tab,
    route_toggle_view_mode_user_facing,
    route_ungroup_groups,
    route_unselect_all_params,
    route_update_param_impl_config,
)
from setta.routers.share_deployments import (
    PublishShareDeploymentRequest,
    route_publish_share_deployment,
)
from setta.routers.terminals import (
    KillSubprocessesRequest,
    route_kill_subprocesses,
    route_run_code,
)
from setta.server_state import SettaFastAPIState
from setta.types.artifact import (
    ArtifactType,
    ChartType,
    DrawAreaLayerItem,
    LineChartSettings,
)
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.clipboard import ProjectStateCoreWithSectionVariantMap
from setta.types.core import Core, Variant, compute_initial_nonPresetImpls
from setta.types.generated.settings_state import SettingsState
from setta.types.helpers_lvl1 import get_curr_effective_section_impl_with_type_guard
from setta.types.helpers_lvl2 import add_kwarg, create_top_level_section
from setta.types.helpers_lvl3 import (
    convert_backend_to_single_config,
    merge_single_config_into_backend,
)
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import (
    Position,
    ProjectConfig,
    WindowSpaceConfig,
    WindowSpaceSurfaceKind,
    WindowSpaceState,
    WindowSpaceWindow,
    WindowSpaceWindowMode,
)
from setta.types.project_state import (
    ChatWindowMode,
    ChatWindowPlacement,
    ProjectChatWindowInstance,
    ProjectChatWindowingState,
    ProjectStateBackend,
    ProjectStateCore,
    ProjectStateSingleConfig,
)
from setta.types.section_impls import (
    ChatSectionImpl,
    ChatPermissionMode,
    CodeFileAccessMode,
    SectionType,
    TextBlockSectionImpl,
)
from setta.types.share_deployment import DeploymentManifest, DeploymentType, SharePolicy

from tests.utils.runtime_context import runtime_context


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = Path(tmpdir) / "deployments" / project_config_name / deployment_version
    root.mkdir(parents=True, exist_ok=True)
    return root


def _write_share_project(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> ID:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        projectChatWindowingByProjectConfigId={
            project_config.id: ProjectChatWindowingState()
        },
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id


def _write_share_project_with_window_space(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> tuple[ID, ID]:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    window_space = WindowSpaceConfig(
        id=create_new_id(),
        name="Saved Layout",
        sortIndex=0,
    )
    project_config.windowSpaces = {window_space.id: window_space}
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        projectChatWindowingByProjectConfigId={
            project_config.id: ProjectChatWindowingState()
        },
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id, window_space.id


def _write_share_project_with_configs(
    root: Path,
    *,
    project_configs: list[ProjectConfig],
    default_project_config_id: ID,
    deployment_version: str,
) -> None:
    dbe = DBE(root)
    project_state = ProjectStateBackend(
        projectConfigs={config.id: config for config in project_configs},
        projectChatWindowingByProjectConfigId={
            config.id: ProjectChatWindowingState() for config in project_configs
        },
        defaultProjectConfigId=default_project_config_id,
    )
    dbe.write_project(project_state)
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=default_project_config_id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())


def _write_share_project_with_entry_code(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
    entry_code_block_id: ID,
) -> ID:
    dbe = DBE(root)
    project_config = ProjectConfig(
        name=project_config_name,
        entryCodeBlockId=entry_code_block_id,
    )
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        projectChatWindowingByProjectConfigId={
            project_config.id: ProjectChatWindowingState()
        },
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id


def _write_share_project_with_section(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> tuple[ID, ID, ID]:
    dbe = DBE(root)
    project_config = ProjectConfig(name=project_config_name)
    section_impl = TextBlockSectionImpl()
    section_id = create_new_id()
    variant_id = create_new_id()
    variant = Variant(
        id=variant_id,
        name="Variant",
        impl=section_impl.id,
        nonPresetImpls=compute_initial_nonPresetImpls(section_impl),
    )
    core = Core(
        id=section_id,
        variants=[variant_id],
        defaultVariant=variant_id,
    )
    project_config.topLevelSections = {section_id: Position()}
    project_config.sectionVariantMap = {section_id: variant_id}
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        projectChatWindowingByProjectConfigId={
            project_config.id: ProjectChatWindowingState()
        },
        defaultProjectConfigId=project_config.id,
        sections={section_id: core},
        sectionImpls={section_impl.id: section_impl},
        sectionVariants={variant_id: variant},
    )
    dbe.write_project(project_state)
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id, section_id, variant_id


def _write_share_project_with_code_param(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> tuple[ID, ID, ID]:
    settings = SettingsState()
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateSingleConfig(projectConfig=project_config)
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Dict,
        Position(),
    )
    param_info_id = add_kwarg(settings, project_state, section_id)
    backend = merge_single_config_into_backend(ProjectStateBackend(), project_state)
    backend.defaultProjectConfigId = project_config.id
    dbe = DBE(root)
    dbe.write_project(backend)
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id, section_id, param_info_id


def _write_share_project_with_chat_section(
    root: Path,
    *,
    project_config_name: str,
    deployment_version: str,
) -> tuple[ID, ID]:
    settings = SettingsState()
    project_config = ProjectConfig(name=project_config_name)
    project_state = ProjectStateSingleConfig(projectConfig=project_config)
    section_id = create_top_level_section(
        settings,
        project_state,
        SectionType.Chat,
        Position(),
    )
    backend = merge_single_config_into_backend(ProjectStateBackend(), project_state)
    backend.defaultProjectConfigId = project_config.id
    dbe = DBE(root)
    dbe.write_project(backend)
    dbe.write_json(root / "policy.json", SharePolicy().model_dump())
    deployment_name = root.parent.name
    manifest = DeploymentManifest(
        version=1,
        deploymentName=deployment_name,
        deploymentType=DeploymentType.share,
        defaultProjectConfigId=project_config.id,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id, section_id


def _write_share_policy(root: Path, policy: SharePolicy) -> None:
    dbe = DBE(root)
    dbe.write_json(root / "policy.json", policy.model_dump())


class TestSharePolicyRoutes:
    pytestmark = pytest.mark.asyncio

    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_llm_routes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLLM=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            request = GetLLMResponseRequest(
                chatId=None,
                message=UserChatMessage(
                    content=[MessageTextContent(text="hello")],
                ),
                engineConfigId=ID("engine-default"),
                thinking=False,
                projectConfigId=project_config_id,
                permissionMode=ChatPermissionMode.minimal,
                searchEnabled=True,
            )

            with pytest.raises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_get_llm_response(
                        request,
                        runtime_ctx,
                    )

            assert ctx.value.status_code == 403

            with pytest.raises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_get_llm_config(runtime_ctx)

            assert ctx.value.status_code == 403

    async def test_publish_share_deployment_blocked_in_share_mode(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)
            request = PublishShareDeploymentRequest(
                deploymentName=root.parent.name,
                projectConfigId=project_config_id,
            )
            with pytest.raises(HTTPException) as ctx:
                await route_publish_share_deployment(request, state)
            assert ctx.value.status_code == 403

    async def test_llm_updates_blocked_in_share_mode(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLLM=True))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(id="primary", model="gpt-4o"),
                },
            )

            with pytest.raises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_set_llm_config(
                        config,
                        runtime_ctx,
                    )
            assert ctx.value.status_code == 403

            payload = UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "test-key"},
                expectedRevision=0,
            )
            with pytest.raises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_set_llm_api_keys(
                        payload,
                        runtime_ctx,
                    )
            assert ctx.value.status_code == 403

    async def test_run_routes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowRun=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            run_request = RunCodeRequest(
                projectConfigId=project_config_id,
                sectionId=create_new_id(),
                cliId=None,
            )

            with pytest.raises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_run_code(run_request, runtime_ctx)

            assert ctx.value.status_code == 403

            kill_request = KillSubprocessesRequest(
                projectConfigId=project_config_id,
            )

            with pytest.raises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_kill_subprocesses(
                        kill_request,
                        runtime_ctx,
                    )

            assert ctx.value.status_code == 403

    async def test_terminal_section_blocked_when_run_disabled(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(
                root,
                SharePolicy(
                    allowRun=False,
                ),
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_runtime_state.create_session_backend(session.id)
            baseline_sections = len(
                state.share_runtime_state.get_session_state(
                    session.id, project_config_id
                ).sections
            )
            create_request = CreateTopLevelSectionRequest(
                projectConfigId=project_config_id,
                implType=SectionType.Terminal,
            )
            with pytest.raises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_create_top_level_section(create_request, runtime_ctx)
            assert ctx.value.status_code == 403
            updated_sections = len(
                state.share_runtime_state.get_session_state(
                    session.id, project_config_id
                ).sections
            )
            assert baseline_sections == updated_sections

    async def test_structural_routes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy())
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            with runtime_context(state, session.id) as runtime_ctx:
                create_request = CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.TextBlock,
                )
                with pytest.raises(HTTPException) as ctx:
                    await route_create_top_level_section(create_request, runtime_ctx)
                assert ctx.value.status_code == 403

                delete_request = DeleteSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[create_new_id()],
                )
                with pytest.raises(HTTPException) as ctx:
                    await route_delete_sections(delete_request, runtime_ctx)
                assert ctx.value.status_code == 403

                code_obj_request = SetCodeObjNameRequest(
                    projectConfigId=project_config_id,
                    codeObjId=create_new_id(),
                    name="renamed",
                )
                with pytest.raises(HTTPException) as ctx:
                    await route_set_code_obj_name(code_obj_request, runtime_ctx)
                assert ctx.value.status_code == 403

                display_request = SetCodeObjDisplayNameRequest(
                    projectConfigId=project_config_id,
                    codeObjId=create_new_id(),
                    displayName="Display",
                )
                with pytest.raises(HTTPException) as ctx:
                    await route_set_code_obj_display_name(display_request, runtime_ctx)
                assert ctx.value.status_code == 403

                binding_request = SetCodeFileBindingRequest(
                    projectConfigId=project_config_id,
                    sectionId=create_new_id(),
                    binding={
                        "canonical_path": "code.py",
                        "access_mode": CodeFileAccessMode.read_write,
                    },
                )
                with pytest.raises(HTTPException) as ctx:
                    await route_set_code_file_binding(binding_request, runtime_ctx)
                assert ctx.value.status_code == 403

                rename_request = SetSectionNameRequest(
                    projectConfigId=project_config_id,
                    sectionId=create_new_id(),
                    name="Renamed",
                )
                with pytest.raises(HTTPException) as ctx:
                    await route_set_section_name(rename_request, runtime_ctx)
                assert ctx.value.status_code == 403

    async def test_param_routes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowParamChanges=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            section_id = create_new_id()
            draw_item = DrawAreaLayerItem(
                type=ArtifactType.BrushStroke,
                dataPath="draw.json",
                transformId="transform-1",
            )
            chart_settings = LineChartSettings()
            requests = [
                (
                    "set_text_block_text",
                    route_set_text_block_text,
                    SetTextBlockTextRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        text="hello",
                    ),
                ),
                (
                    "set_gen_code_prefix",
                    route_set_gen_code_prefix,
                    SetGenCodePrefixRequest(
                        projectConfigId=project_config_id,
                        genCodePrefix="prefix",
                    ),
                ),
                (
                    "set_callable",
                    route_set_callable,
                    SetCallableRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        callableName="module.fn",
                        refetchParams=False,
                    ),
                ),
                (
                    "set_gen_code_suffix",
                    route_set_gen_code_suffix,
                    SetGenCodeSuffixRequest(
                        projectConfigId=project_config_id,
                        genCodeSuffix="suffix",
                    ),
                ),
                (
                    "set_code",
                    route_set_code,
                    SetCodeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        code="print('hi')",
                    ),
                ),
                (
                    "format_code",
                    route_format_code,
                    FormatCodeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                    ),
                ),
                (
                    "append_draw_area_layer_item",
                    route_append_draw_area_layer_item,
                    AppendDrawAreaLayerItemRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        layerIdx=0,
                        element=draw_item,
                    ),
                ),
                (
                    "set_image_area_image_path",
                    route_set_image_area_image_path,
                    SetImageAreaImagePathRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        imagePath="image.png",
                    ),
                ),
                (
                    "set_chart_area_data_path",
                    route_set_chart_area_data_path,
                    SetChartAreaDataPathRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        dataPath="data.csv",
                    ),
                ),
                (
                    "set_chart_type",
                    route_set_chart_type,
                    SetChartTypeRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        chartType=ChartType.line,
                    ),
                ),
                (
                    "set_chart_settings",
                    route_set_chart_settings,
                    SetChartSettingsRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        chartSettings=chart_settings,
                        changedSettings=[],
                    ),
                ),
                (
                    "add_kwarg",
                    route_add_kwarg,
                    AddKwargRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                    ),
                ),
                (
                    "delete_kwarg",
                    route_delete_kwarg,
                    DeleteKwargRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                    ),
                ),
                (
                    "set_type_error_ignore",
                    route_set_type_error_ignore,
                    SetTypeErrorIgnoreRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        paramInfoId=create_new_id(),
                        ignoreTypeErrors=True,
                    ),
                ),
                (
                    "get_password_param_value",
                    route_get_password_param_value,
                    GetPasswordParamValueRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        paramInfoId=create_new_id(),
                    ),
                ),
            ]

            with runtime_context(state, session.id) as runtime_ctx:
                for name, handler, request in requests:
                    with pytest.raises(HTTPException) as ctx:
                        await handler(request, runtime_ctx)
                    assert ctx.value.status_code == 403, name

    async def test_code_param_edits_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id, section_id, param_info_id = (
                _write_share_project_with_code_param(
                    root,
                    project_config_name=project_config_name,
                    deployment_version=root.name,
                )
            )
            _write_share_policy(root, SharePolicy(allowParamChanges=True))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            requests = [
                (
                    "set_param_entered_value",
                    route_set_param_entered_value,
                    SetParamEnteredValueRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        paramInfoId=param_info_id,
                        value="123",
                    ),
                ),
                (
                    "update_param_impl_config",
                    route_update_param_impl_config,
                    UpdateParamImplConfigRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        paramInfoId=param_info_id,
                        newConfig={"value": "456"},
                    ),
                ),
                (
                    "change_param_impl",
                    route_change_param_impl,
                    ChangeParamImplRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        paramInfoId=param_info_id,
                        selectedId="CodeParam",
                    ),
                ),
            ]

            with runtime_context(state, session.id) as runtime_ctx:
                for name, handler, request in requests:
                    with pytest.raises(HTTPException) as ctx:
                        await handler(request, runtime_ctx)
                    assert ctx.value.status_code == 403, name

    async def test_password_reveal_blocked_when_param_changes_allowed(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowParamChanges=True))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            request = GetPasswordParamValueRequest(
                projectConfigId=project_config_id,
                sectionId=create_new_id(),
                paramInfoId=create_new_id(),
            )

            with runtime_context(state, session.id) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_get_password_param_value(request, runtime_ctx)
                assert ctx.value.status_code == 403

    async def test_param_impl_and_kwargs_blocked_when_param_changes_allowed(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id, section_id, param_info_id = (
                _write_share_project_with_code_param(
                    root,
                    project_config_name=project_config_name,
                    deployment_version=root.name,
                )
            )
            _write_share_policy(root, SharePolicy(allowParamChanges=True))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            requests = [
                (
                    "change_param_impl",
                    route_change_param_impl,
                    ChangeParamImplRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        paramInfoId=param_info_id,
                        selectedId="TextParam",
                    ),
                ),
                (
                    "update_param_impl_config",
                    route_update_param_impl_config,
                    UpdateParamImplConfigRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        paramInfoId=param_info_id,
                        newConfig={"value": "456"},
                    ),
                ),
                (
                    "add_kwarg",
                    route_add_kwarg,
                    AddKwargRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                    ),
                ),
                (
                    "delete_kwarg",
                    route_delete_kwarg,
                    DeleteKwargRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                    ),
                ),
            ]

            with runtime_context(state, session.id) as runtime_ctx:
                for name, handler, request in requests:
                    with pytest.raises(HTTPException) as ctx:
                        await handler(request, runtime_ctx)
                    assert ctx.value.status_code == 403, name

    async def test_param_policy_applies_to_all_configs(self) -> None:
        with TemporaryDirectory() as tmpdir:
            config_a = ProjectConfig(name="Share Config A")
            config_b = ProjectConfig(name="Share Config B")
            root = _build_share_deployment_root(tmpdir, config_a.name)
            _write_share_project_with_configs(
                root,
                project_configs=[config_a, config_b],
                default_project_config_id=config_a.id,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowParamChanges=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            with runtime_context(state, session.id) as runtime_ctx:
                request = SetTextBlockTextRequest(
                    projectConfigId=config_b.id,
                    sectionId=create_new_id(),
                    text="blocked",
                )
                with pytest.raises(HTTPException) as ctx:
                    await route_set_text_block_text(request, runtime_ctx)
                assert ctx.value.status_code == 403

    async def test_layout_routes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLayoutChanges=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            requests = [
                (
                    "set_callable_hide_params",
                    route_set_callable_hide_params,
                    SetCallableHideParamsRequest(
                        projectConfigId=project_config_id,
                        sectionId=create_new_id(),
                        hideParams=True,
                    ),
                ),
                (
                    "set_list_root_view_mode",
                    route_set_list_root_view_mode,
                    SetListRootViewModeRequest(
                        projectConfigId=project_config_id,
                        sectionId=create_new_id(),
                        viewMode="task_list",
                    ),
                ),
                (
                    "set_parent_default_child_section_type",
                    route_set_parent_default_child_section_type,
                    SetParentDefaultChildSectionTypeRequest(
                        projectConfigId=project_config_id,
                        sectionId=create_new_id(),
                        defaultChildSectionType=SectionType.Dict,
                    ),
                ),
                (
                    "set_task_board_section_state",
                    route_set_task_board_section_state,
                    SetTaskBoardSectionStateRequest(
                        projectConfigId=project_config_id,
                        sectionId=create_new_id(),
                        viewMode="task_list",
                        columns=[],
                        tasks=[],
                    ),
                ),
                (
                    "set_spreadsheet_file_path",
                    route_set_spreadsheet_file_path,
                    SetSpreadsheetFilePathRequest(
                        projectConfigId=project_config_id,
                        sectionId=create_new_id(),
                        filePath="/tmp/missing.csv",
                        activeSheet=None,
                    ),
                ),
                (
                    "set_spreadsheet_section_settings",
                    route_set_spreadsheet_section_settings,
                    SetSpreadsheetSectionSettingsRequest(
                        projectConfigId=project_config_id,
                        sectionId=create_new_id(),
                        readOnly=False,
                        showRowNumbers=True,
                        density="compact",
                        autoReloadOnExternalChange=False,
                    ),
                ),
                (
                    "set_text_block_master_font_size",
                    route_set_text_block_master_font_size,
                    SetTextBlockMasterFontSizeRequest(
                        projectConfigId=project_config_id,
                        sectionId=create_new_id(),
                        masterFontSizePx=18.0,
                    ),
                ),
            ]
            with runtime_context(state, session.id) as runtime_ctx:
                for name, handler, request in requests:
                    with pytest.raises(HTTPException) as ctx:
                        await handler(request, runtime_ctx)
                    assert ctx.value.status_code == 403, name

    async def test_param_selection_routes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowParamChanges=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            toggle_request = ToggleParamSelectedRequest(
                projectConfigId=project_config_id,
                sectionId=create_new_id(),
                paramInfoId=create_new_id(),
            )
            with runtime_context(state, session.id) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_toggle_param_selected(toggle_request, runtime_ctx)
                assert ctx.value.status_code == 403

                unselect_request = UnselectAllParamsRequest(
                    projectConfigId=project_config_id,
                )
                with pytest.raises(HTTPException) as ctx:
                    await route_unselect_all_params(unselect_request, runtime_ctx)
                assert ctx.value.status_code == 403

    async def test_view_mode_routes_blocked_when_variant_changes_allowed(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowVariantChanges=True))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            requests = [
                (
                    "create_view_mode",
                    route_create_view_mode,
                    CreateViewModeRequest(projectConfigId=project_config_id),
                ),
                (
                    "toggle_is_editing_view_mode",
                    route_toggle_is_editing_view_mode,
                    ToggleIsEditingViewModeRequest(projectConfigId=project_config_id),
                ),
                (
                    "toggle_view_mode_user_facing",
                    route_toggle_view_mode_user_facing,
                    ToggleViewModeUserFacingRequest(
                        projectConfigId=project_config_id,
                        viewModeId=create_new_id(),
                    ),
                ),
                (
                    "toggle_view_mode_tab",
                    route_toggle_view_mode_tab,
                    ToggleViewModeTabRequest(
                        projectConfigId=project_config_id,
                        viewModeId=create_new_id(),
                    ),
                ),
                (
                    "toggle_section_visibility",
                    route_toggle_section_visibility,
                    ToggleSectionVisibilityRequest(
                        projectConfigId=project_config_id,
                        sectionIds=[create_new_id()],
                    ),
                ),
                (
                    "set_view_mode_name",
                    route_set_view_mode_name,
                    SetViewModeNameRequest(
                        projectConfigId=project_config_id,
                        viewModeId=create_new_id(),
                        name="Viewer",
                    ),
                ),
                (
                    "delete_view_mode",
                    route_delete_view_mode,
                    DeleteViewModeRequest(
                        projectConfigId=project_config_id,
                        viewModeId=create_new_id(),
                    ),
                ),
            ]

            with runtime_context(state, session.id) as runtime_ctx:
                for name, handler, request in requests:
                    with pytest.raises(HTTPException) as ctx:
                        await handler(request, runtime_ctx)
                    assert ctx.value.status_code == 403, name

    async def test_layout_routes_blocked_when_layout_changes_allowed(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLayoutChanges=True))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            requests = [
                (
                    "group_sections",
                    route_group_sections,
                    GroupSectionsRequest(
                        projectConfigId=project_config_id,
                        sectionIds=[create_new_id()],
                    ),
                ),
                (
                    "ungroup_groups",
                    route_ungroup_groups,
                    UngroupGroupsRequest(
                        projectConfigId=project_config_id,
                        groupIds=[create_new_id()],
                    ),
                ),
                (
                    "set_social_url",
                    route_set_social_url,
                    SetSocialUrlRequest(
                        projectConfigId=project_config_id,
                        sectionId=create_new_id(),
                        url="https://example.com",
                    ),
                ),
            ]

            with runtime_context(state, session.id) as runtime_ctx:
                for name, handler, request in requests:
                    with pytest.raises(HTTPException) as ctx:
                        await handler(request, runtime_ctx)
                    assert ctx.value.status_code == 403, name

    async def test_window_space_routes_blocked_when_layout_changes_disallowed(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id, window_space_id = _write_share_project_with_window_space(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLayoutChanges=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            next_window_state = WindowSpaceState(
                windowsById={
                    "project-chat-window-1": WindowSpaceWindow(
                        title="Research Chat",
                    )
                },
                order=["project-chat-window-1"],
            )
            next_project_chat_windowing = ProjectChatWindowingState(
                instancesById={
                    "project-chat-window-1": ProjectChatWindowInstance(
                        instanceId="project-chat-window-1",
                        placement=ChatWindowPlacement.floating,
                        mode=ChatWindowMode.project_ai_mode,
                        title="Research Chat",
                    )
                },
                order=["project-chat-window-1"],
                nextInstanceNumber=2,
            )
            requests = [
                (
                    "set_project_chat_windowing_state",
                    route_set_project_chat_windowing_state,
                    SetProjectChatWindowingStateRequest(
                        projectConfigId=project_config_id,
                        state=next_project_chat_windowing,
                    ),
                ),
                (
                    "create_window_space",
                    route_create_window_space,
                    CreateWindowSpaceRequest(
                        projectConfigId=project_config_id,
                        state=next_window_state,
                        name="Blocked Layout",
                    ),
                ),
                (
                    "set_window_space_name",
                    route_set_window_space_name,
                    SetWindowSpaceNameRequest(
                        projectConfigId=project_config_id,
                        windowSpaceId=window_space_id,
                        name="Renamed Layout",
                    ),
                ),
                (
                    "set_window_space_sort_order",
                    route_set_window_space_sort_order,
                    SetWindowSpaceSortOrderRequest(
                        projectConfigId=project_config_id,
                        orderedWindowSpaceIds=[window_space_id],
                    ),
                ),
                (
                    "delete_window_space",
                    route_delete_window_space,
                    DeleteWindowSpaceRequest(
                        projectConfigId=project_config_id,
                        windowSpaceId=window_space_id,
                    ),
                ),
            ]

            with runtime_context(state, session.id) as runtime_ctx:
                for name, handler, request in requests:
                    with pytest.raises(HTTPException) as ctx:
                        await handler(request, runtime_ctx)
                    assert ctx.value.status_code == 403, name
                    assert (
                        ctx.value.detail
                        == "Deployment policy disallows layout changes."
                    ), name

    async def test_window_space_routes_reject_invalid_window_owners(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id, _window_space_id = (
                _write_share_project_with_window_space(
                    root,
                    project_config_name=project_config_name,
                    deployment_version=root.name,
                )
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            initial_project_state = convert_backend_to_single_config(
                state.share_runtime_state.project_state_backend,
                project_config_id,
            )
            initial_windowing = initial_project_state.projectChatWindowing.model_dump()
            initial_window_spaces = {
                window_space_id: window_space.model_dump()
                for window_space_id, window_space in initial_project_state.projectConfig.windowSpaces.items()
            }

            with runtime_context(state, session.id) as runtime_ctx:
                with pytest.raises(HTTPException) as windowing_ctx:
                    await route_set_project_chat_windowing_state(
                        SetProjectChatWindowingStateRequest(
                            projectConfigId=project_config_id,
                            state=ProjectChatWindowingState(
                                instancesById={
                                    "project-chat-window-1": ProjectChatWindowInstance(
                                        instanceId="project-chat-window-1",
                                        placement=ChatWindowPlacement.floating,
                                        mode=ChatWindowMode.section_mode,
                                        sectionIdOrNull=None,
                                    )
                                },
                                order=["project-chat-window-1"],
                                nextInstanceNumber=2,
                            ),
                        ),
                        runtime_ctx,
                    )
                assert windowing_ctx.value.status_code == 422

                with pytest.raises(
                    ValidationError,
                    match="Project-chat window-space windows cannot carry sectionIdOrNull",
                ):
                    WindowSpaceWindow(
                        surfaceKind=WindowSpaceSurfaceKind.project_chat,
                        sectionIdOrNull="section-1",
                    )

                with pytest.raises(
                    ValidationError,
                    match="Section window-space windows cannot use git_graph_mode",
                ):
                    WindowSpaceWindow(
                        surfaceKind=WindowSpaceSurfaceKind.section,
                        mode=WindowSpaceWindowMode.git_graph_mode,
                        sectionIdOrNull="section-1",
                    )

            updated_project_state = convert_backend_to_single_config(
                state.share_runtime_state.project_state_backend,
                project_config_id,
            )
            assert (
                updated_project_state.projectChatWindowing.model_dump()
                == initial_windowing
            )
            assert {
                window_space_id: window_space.model_dump()
                for window_space_id, window_space in updated_project_state.projectConfig.windowSpaces.items()
            } == initial_window_spaces

    async def test_section_chat_thread_binding_allowed_when_llm_allowed_and_layout_blocked(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id, section_id = _write_share_project_with_chat_section(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(
                root,
                SharePolicy(allowLLM=True, allowLayoutChanges=False),
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_runtime_state.create_session_backend(session.id)

            with runtime_context(state, session.id) as runtime_ctx:
                await route_set_chat_section_chat_id(
                    SetChatSectionChatIdRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                        chatId="chat-bound",
                    ),
                    runtime_ctx,
                )
            session_backend = state.share_runtime_state.get_session_backend(session.id)
            session_project_state = convert_backend_to_single_config(
                session_backend,
                project_config_id,
            )
            persisted_chat_id = get_curr_effective_section_impl_with_type_guard(
                session_project_state,
                section_id,
                ChatSectionImpl,
            ).chatId

            assert persisted_chat_id == "chat-bound"

    async def test_section_chat_thread_binding_blocked_when_llm_is_disallowed(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id, section_id = _write_share_project_with_chat_section(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(
                root,
                SharePolicy(allowLLM=False, allowLayoutChanges=False),
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_runtime_state.create_session_backend(session.id)

            with pytest.raises(HTTPException) as ctx:
                with runtime_context(state, session.id) as runtime_ctx:
                    await route_set_chat_section_chat_id(
                        SetChatSectionChatIdRequest(
                            projectConfigId=project_config_id,
                            sectionId=section_id,
                            chatId="chat-bound",
                        ),
                        runtime_ctx,
                    )

            with runtime_context(state, session.id) as runtime_ctx:
                persisted_chat_id = await route_get_chat_section_chat_id(
                    GetChatSectionChatIdRequest(
                        projectConfigId=project_config_id,
                        sectionId=section_id,
                    ),
                    runtime_ctx,
                )

            assert ctx.value.status_code == 403
            assert ctx.value.detail == "Deployment policy disallows LLM access."
            assert persisted_chat_id is None

    async def test_window_space_routes_allowed_when_layout_changes_allowed(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLayoutChanges=True))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            next_window_state = WindowSpaceState(
                windowsById={
                    "project-chat-window-1": WindowSpaceWindow(
                        title="Research Chat",
                    )
                },
                order=["project-chat-window-1"],
            )
            next_project_chat_windowing = ProjectChatWindowingState(
                instancesById={
                    "project-chat-window-1": ProjectChatWindowInstance(
                        instanceId="project-chat-window-1",
                        placement=ChatWindowPlacement.floating,
                        mode=ChatWindowMode.project_ai_mode,
                        title="Research Chat",
                    )
                },
                order=["project-chat-window-1"],
                nextInstanceNumber=2,
            )

            with runtime_context(state, session.id) as runtime_ctx:
                normalized_windowing = await route_set_project_chat_windowing_state(
                    SetProjectChatWindowingStateRequest(
                        projectConfigId=project_config_id,
                        state=next_project_chat_windowing,
                    ),
                    runtime_ctx,
                )
                assert normalized_windowing.order == ["project-chat-window-1"]

                created_window_space = await route_create_window_space(
                    CreateWindowSpaceRequest(
                        projectConfigId=project_config_id,
                        state=next_window_state,
                        name="First Layout",
                    ),
                    runtime_ctx,
                )
                assert created_window_space.id

                await route_set_window_space_name(
                    SetWindowSpaceNameRequest(
                        projectConfigId=project_config_id,
                        windowSpaceId=created_window_space.id,
                        name="Renamed Layout",
                    ),
                    runtime_ctx,
                )
                second_window_space = await route_create_window_space(
                    CreateWindowSpaceRequest(
                        projectConfigId=project_config_id,
                        state=WindowSpaceState(),
                        name="Second Layout",
                    ),
                    runtime_ctx,
                )

                await route_set_window_space_sort_order(
                    SetWindowSpaceSortOrderRequest(
                        projectConfigId=project_config_id,
                        orderedWindowSpaceIds=[
                            second_window_space.id,
                            created_window_space.id,
                        ],
                    ),
                    runtime_ctx,
                )

                await route_delete_window_space(
                    DeleteWindowSpaceRequest(
                        projectConfigId=project_config_id,
                        windowSpaceId=second_window_space.id,
                    ),
                    runtime_ctx,
                )

            session_state = state.share_runtime_state.get_session_state(
                session.id,
                project_config_id,
            )
            created_window_space = session_state.projectConfig.windowSpaces[
                created_window_space.id
            ]
            assert session_state.projectChatWindowing.order == ["project-chat-window-1"]
            assert created_window_space.name == "Renamed Layout"
            assert created_window_space.sortIndex == 0
            assert created_window_space.order == ["project-chat-window-1"]
            assert (
                created_window_space.windowsById["project-chat-window-1"].title
                == "Research Chat"
            )
            assert (
                second_window_space.id not in session_state.projectConfig.windowSpaces
            )

    async def test_window_space_routes_return_404_for_missing_window_space_ids(
        self,
    ) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowLayoutChanges=True))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            missing_window_space_id = "missing-window-space"
            requests = [
                (
                    route_set_window_space_name,
                    SetWindowSpaceNameRequest(
                        projectConfigId=project_config_id,
                        windowSpaceId=missing_window_space_id,
                        name="Renamed Layout",
                    ),
                ),
                (
                    route_delete_window_space,
                    DeleteWindowSpaceRequest(
                        projectConfigId=project_config_id,
                        windowSpaceId=missing_window_space_id,
                    ),
                ),
            ]

            with runtime_context(state, session.id) as runtime_ctx:
                for handler, request in requests:
                    with pytest.raises(HTTPException) as ctx:
                        await handler(request, runtime_ctx)
                    assert ctx.value.status_code == 404
                    assert (
                        ctx.value.detail
                        == f"Window space {missing_window_space_id} not found"
                    )

    async def test_paste_sections_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy())
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            request = PasteSectionsRequest(
                projectConfigId=project_config_id,
                data=ProjectStateCoreWithSectionVariantMap(core=ProjectStateCore()),
                position=Position(x=0, y=0),
                asRef=False,
            )
            with runtime_context(state, session.id) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_paste_sections(request, runtime_ctx)
                assert ctx.value.status_code == 403

    async def test_rename_refactor_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy())
            state = await self._build_state(root)
            session = state.share_session_store.create_session()

            accept_request = AcceptRenameRefactorRequest(
                projectConfigId=project_config_id,
            )
            decline_request = DeclineRenameRefactorRequest(
                projectConfigId=project_config_id,
            )
            with runtime_context(state, session.id) as runtime_ctx:
                with pytest.raises(HTTPException) as ctx:
                    await route_accept_rename_refactor(accept_request, runtime_ctx)
                assert ctx.value.status_code == 403

                with pytest.raises(HTTPException) as ctx:
                    await route_decline_rename_refactor(decline_request, runtime_ctx)
                assert ctx.value.status_code == 403

    async def test_terminal_routes_require_share_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)

            with pytest.raises(HTTPException) as ctx:
                require_share_session_id(state, None)
            assert ctx.value.status_code == 400

            with pytest.raises(HTTPException) as ctx:
                require_share_session_id(state, "missing-session")
            assert ctx.value.status_code == 404

            with pytest.raises(HTTPException) as ctx:
                require_share_session_id(state, None)
            assert ctx.value.status_code == 400

            with pytest.raises(HTTPException) as ctx:
                require_share_session_id(state, "missing-session")
            assert ctx.value.status_code == 404
