import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException
from starlette.requests import Request

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.project_state.project_manager_types import (
    CreateTopLevelSectionRequest,
    DeleteSectionsRequest,
)
from setta.routers.ai import GetLLMResponseRequest, route_get_llm_response
from setta.routers.llm import (
    UpdateAPIKeysRequest,
    route_get_llm_config,
    route_set_llm_api_keys,
    route_set_llm_config,
)
from setta.routers.project_manager import (
    route_create_top_level_section,
    route_delete_sections,
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
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import SectionType
from setta.types.share_deployment import SharePolicy


def _write_share_project(root: Path) -> ID:
    dbe = DBE(root)
    project_config = ProjectConfig(name="share-policy-route-test")
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
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
            root = Path(tmpdir)
            project_config_id = _write_share_project(root)
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

    async def test_llm_updates_blocked_in_share_mode(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            _write_share_project(root)
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
            root = Path(tmpdir)
            project_config_id = _write_share_project(root)
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
            root = Path(tmpdir)
            project_config_id = _write_share_project(root)
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

    async def test_structural_routes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config_id = _write_share_project(root)
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
            finally:
                reset_share_session_id(token)

    async def test_terminal_routes_require_share_session_id(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config_id = _write_share_project(root)
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
