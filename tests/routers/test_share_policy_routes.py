import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException
from starlette.requests import Request

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.project_state.project_manager_types import (
    AcceptRenameRefactorRequest,
    AppendDrawAreaLayerItemRequest,
    CreateTopLevelSectionRequest,
    DeclineRenameRefactorRequest,
    DeleteSectionsRequest,
    PasteSectionsRequest,
    SetCallableRequest,
    SetChartAreaDataPathRequest,
    SetChartSettingsRequest,
    SetChartTypeRequest,
    SetCodeRequest,
    SetCodeFileBindingRequest,
    SetCodeObjDisplayNameRequest,
    SetCodeObjNameRequest,
    SetGenCodePrefixRequest,
    SetGenCodeSuffixRequest,
    SetImageAreaImagePathRequest,
    SetTextBlockTextRequest,
    ToggleParamSelectedRequest,
    UnselectAllParamsRequest,
)
from setta.routers.ai import GetLLMResponseRequest, route_get_llm_response
from setta.routers.llm import (
    UpdateAPIKeysRequest,
    route_get_llm_config,
    route_set_llm_api_keys,
    route_set_llm_config,
)
from setta.routers.project_manager import (
    route_accept_rename_refactor,
    route_append_draw_area_layer_item,
    route_create_top_level_section,
    route_delete_sections,
    route_decline_rename_refactor,
    route_paste_sections,
    route_set_callable,
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
    route_set_text_block_text,
    route_toggle_param_selected,
    route_unselect_all_params,
)
from setta.routers.share_deployments import (
    PublishShareDeploymentRequest,
    route_publish_share_deployment,
)
from setta.routers.terminals import (
    DeleteTerminalsRequest,
    KillSubprocessesRequest,
    RunCodeRequest,
    route_delete_terminals,
    route_kill_subprocesses,
    route_run_code,
)
from setta.server_state import SettaFastAPIState
from setta.share.session_context import reset_share_session_id, set_share_session_id
from setta.types.artifact import (
    ArtifactType,
    ChartType,
    DrawAreaLayerItem,
    LineChartSettings,
)
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.clipboard import ProjectStateCoreWithSectionVariantMap
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import Position, ProjectConfig
from setta.types.project_state import ProjectStateBackend, ProjectStateCore
from setta.types.section_impls import CodeFileAccessMode, SectionType
from setta.types.share_deployment import ShareDeploymentManifest, SharePolicy


def _build_share_deployment_root(
    tmpdir: str,
    project_config_name: str,
    deployment_version: str = "v1",
) -> Path:
    root = (
        Path(tmpdir)
        / "share_deployments"
        / project_config_name
        / deployment_version
    )
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
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    manifest = ShareDeploymentManifest(
        version=1,
        projectConfigId=project_config.id,
        projectConfigName=project_config.name,
        deploymentVersion=deployment_version,
    )
    dbe.write_json(root / "manifest.json", manifest.model_dump())
    return project_config.id


def _write_share_policy(root: Path, policy: SharePolicy) -> None:
    dbe = DBE(root)
    dbe.write_json(root / "share_policy.json", policy.model_dump())


def _build_share_request(session_id: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/runCode",
            "raw_path": b"/runCode",
            "query_string": b"",
            "headers": [(b"x-share-session-id", session_id.encode("utf-8"))],
            "client": ("testclient", 123),
            "server": ("testserver", 80),
            "scheme": "http",
            "root_path": "",
        }
    )


class SharePolicyRouteTests(unittest.IsolatedAsyncioTestCase):
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
                llmConfigId="default",
                deepThink=False,
                projectConfigId=project_config_id,
            )

            with self.assertRaises(HTTPException) as ctx:
                await route_get_llm_response(
                    request,
                    state,
                    share_session_id=session.id,
                )

            self.assertEqual(403, ctx.exception.status_code)

            with self.assertRaises(HTTPException) as ctx:
                await route_get_llm_config(state, share_session_id=session.id)

            self.assertEqual(403, ctx.exception.status_code)

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
                projectConfigId=project_config_id,
            )
            with self.assertRaises(HTTPException) as ctx:
                await route_publish_share_deployment(request, state)
            self.assertEqual(403, ctx.exception.status_code)

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

            with self.assertRaises(HTTPException) as ctx:
                await route_set_llm_config(
                    config,
                    state,
                    share_session_id=session.id,
                )
            self.assertEqual(403, ctx.exception.status_code)

            payload = UpdateAPIKeysRequest(
                apiKeys={"OPENAI_API_KEY": "test-key"}
            )
            with self.assertRaises(HTTPException) as ctx:
                await route_set_llm_api_keys(
                    payload,
                    state,
                    share_session_id=session.id,
                )
            self.assertEqual(403, ctx.exception.status_code)

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
            request = _build_share_request(session.id)

            with self.assertRaises(HTTPException) as ctx:
                await route_run_code(run_request, state, request)

            self.assertEqual(403, ctx.exception.status_code)

            kill_request = KillSubprocessesRequest(
                projectConfigId=project_config_id,
            )

            with self.assertRaises(HTTPException) as ctx:
                await route_kill_subprocesses(
                    kill_request,
                    state,
                    share_session_id=session.id,
                )

            self.assertEqual(403, ctx.exception.status_code)

    async def test_run_routes_blocked_by_allowed_sections(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            allowed_section_id = create_new_id()
            blocked_section_id = create_new_id()
            _write_share_policy(
                root,
                SharePolicy(
                    allowRun=True,
                    allowedSections=[allowed_section_id],
                ),
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            run_request = RunCodeRequest(
                projectConfigId=project_config_id,
                sectionId=blocked_section_id,
                cliId=None,
            )
            request = _build_share_request(session.id)

            with self.assertRaises(HTTPException) as ctx:
                await route_run_code(run_request, state, request)

            self.assertEqual(403, ctx.exception.status_code)
            self.assertIn("Share policy disallows changes to sections", ctx.exception.detail)

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
                    allowStructuralChanges=True,
                ),
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            state.share_project_manager.create_session_state(session.id)
            token = set_share_session_id(session.id)

            try:
                baseline_sections = len(
                    state.share_project_manager.get_session_state(session.id).sections
                )
                create_request = CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.Terminal,
                )
                with self.assertRaises(HTTPException) as ctx:
                    await route_create_top_level_section(create_request, state)
                self.assertEqual(403, ctx.exception.status_code)
                updated_sections = len(
                    state.share_project_manager.get_session_state(session.id).sections
                )
                self.assertEqual(baseline_sections, updated_sections)
            finally:
                reset_share_session_id(token)

    async def test_structural_routes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowStructuralChanges=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            token = set_share_session_id(session.id)

            try:
                create_request = CreateTopLevelSectionRequest(
                    projectConfigId=project_config_id,
                    implType=SectionType.TextBlock,
                )
                with self.assertRaises(HTTPException) as ctx:
                    await route_create_top_level_section(create_request, state)
                self.assertEqual(403, ctx.exception.status_code)

                delete_request = DeleteSectionsRequest(
                    projectConfigId=project_config_id,
                    sectionIds=[create_new_id()],
                )
                with self.assertRaises(HTTPException) as ctx:
                    await route_delete_sections(delete_request, state)
                self.assertEqual(403, ctx.exception.status_code)

                code_obj_request = SetCodeObjNameRequest(
                    projectConfigId=project_config_id,
                    codeObjId=create_new_id(),
                    name="renamed",
                )
                with self.assertRaises(HTTPException) as ctx:
                    await route_set_code_obj_name(code_obj_request, state)
                self.assertEqual(403, ctx.exception.status_code)

                display_request = SetCodeObjDisplayNameRequest(
                    projectConfigId=project_config_id,
                    codeObjId=create_new_id(),
                    displayName="Display",
                )
                with self.assertRaises(HTTPException) as ctx:
                    await route_set_code_obj_display_name(display_request, state)
                self.assertEqual(403, ctx.exception.status_code)

                binding_request = SetCodeFileBindingRequest(
                    projectConfigId=project_config_id,
                    sectionId=create_new_id(),
                    binding={
                        "canonical_path": "code.py",
                        "access_mode": CodeFileAccessMode.read_write,
                    },
                )
                with self.assertRaises(HTTPException) as ctx:
                    await route_set_code_file_binding(binding_request, state)
                self.assertEqual(403, ctx.exception.status_code)
            finally:
                reset_share_session_id(token)

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
            token = set_share_session_id(session.id)

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
            ]

            try:
                for name, handler, request in requests:
                    with self.subTest(name=name):
                        with self.assertRaises(HTTPException) as ctx:
                            await handler(request, state)
                        self.assertEqual(403, ctx.exception.status_code)
            finally:
                reset_share_session_id(token)

    async def test_param_routes_blocked_by_allowed_sections(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            allowed_section_id = create_new_id()
            blocked_section_id = create_new_id()
            _write_share_policy(
                root,
                SharePolicy(
                    allowParamChanges=True,
                    allowedSections=[allowed_section_id],
                ),
            )
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            token = set_share_session_id(session.id)

            request = SetTextBlockTextRequest(
                projectConfigId=project_config_id,
                sectionId=blocked_section_id,
                text="blocked",
            )
            try:
                with self.assertRaises(HTTPException) as ctx:
                    await route_set_text_block_text(request, state)
                self.assertEqual(403, ctx.exception.status_code)
                self.assertIn(
                    "Share policy disallows changes to sections",
                    ctx.exception.detail,
                )
            finally:
                reset_share_session_id(token)

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
            token = set_share_session_id(session.id)

            try:
                toggle_request = ToggleParamSelectedRequest(
                    projectConfigId=project_config_id,
                    sectionId=create_new_id(),
                    paramInfoId=create_new_id(),
                )
                with self.assertRaises(HTTPException) as ctx:
                    await route_toggle_param_selected(toggle_request, state)
                self.assertEqual(403, ctx.exception.status_code)

                unselect_request = UnselectAllParamsRequest(
                    projectConfigId=project_config_id,
                )
                with self.assertRaises(HTTPException) as ctx:
                    await route_unselect_all_params(unselect_request, state)
                self.assertEqual(403, ctx.exception.status_code)
            finally:
                reset_share_session_id(token)

    async def test_paste_sections_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowStructuralChanges=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            token = set_share_session_id(session.id)

            request = PasteSectionsRequest(
                projectConfigId=project_config_id,
                data=ProjectStateCoreWithSectionVariantMap(core=ProjectStateCore()),
                position=Position(x=0, y=0),
                asRef=False,
            )
            try:
                with self.assertRaises(HTTPException) as ctx:
                    await route_paste_sections(request, state)
                self.assertEqual(403, ctx.exception.status_code)
            finally:
                reset_share_session_id(token)

    async def test_rename_refactor_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            _write_share_policy(root, SharePolicy(allowStructuralChanges=False))
            state = await self._build_state(root)
            session = state.share_session_store.create_session()
            token = set_share_session_id(session.id)

            accept_request = AcceptRenameRefactorRequest(
                projectConfigId=project_config_id,
            )
            decline_request = DeclineRenameRefactorRequest(
                projectConfigId=project_config_id,
            )
            try:
                with self.assertRaises(HTTPException) as ctx:
                    await route_accept_rename_refactor(accept_request, state)
                self.assertEqual(403, ctx.exception.status_code)

                with self.assertRaises(HTTPException) as ctx:
                    await route_decline_rename_refactor(decline_request, state)
                self.assertEqual(403, ctx.exception.status_code)
            finally:
                reset_share_session_id(token)

    async def test_terminal_routes_require_share_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_config_name = "share-policy-route-test"
            root = _build_share_deployment_root(tmpdir, project_config_name)
            project_config_id = _write_share_project(
                root,
                project_config_name=project_config_name,
                deployment_version=root.name,
            )
            state = await self._build_state(root)

            delete_request = DeleteTerminalsRequest(sectionIds=[create_new_id()])
            with self.assertRaises(HTTPException) as ctx:
                await route_delete_terminals(
                    delete_request,
                    state,
                    share_session_id=None,
                )
            self.assertEqual(400, ctx.exception.status_code)

            with self.assertRaises(HTTPException) as ctx:
                await route_delete_terminals(
                    delete_request,
                    state,
                    share_session_id="missing-session",
                )
            self.assertEqual(404, ctx.exception.status_code)

            kill_request = KillSubprocessesRequest(projectConfigId=project_config_id)
            with self.assertRaises(HTTPException) as ctx:
                await route_kill_subprocesses(
                    kill_request,
                    state,
                    share_session_id=None,
                )
            self.assertEqual(400, ctx.exception.status_code)

            with self.assertRaises(HTTPException) as ctx:
                await route_kill_subprocesses(
                    kill_request,
                    state,
                    share_session_id="missing-session",
                )
            self.assertEqual(404, ctx.exception.status_code)


if __name__ == "__main__":
    unittest.main()
