import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI, HTTPException

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.routers.ai import GetLLMResponseRequest, route_get_llm_response
from setta.routers.llm import route_get_llm_config
from setta.routers.terminals import (
    KillSubprocessesRequest,
    RunCodeRequest,
    route_kill_subprocesses,
    route_run_code,
)
from setta.server_state import SettaFastAPIState
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
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
                await route_get_llm_response(request, state)

            self.assertEqual(403, ctx.exception.status_code)

            with self.assertRaises(HTTPException) as ctx:
                await route_get_llm_config(state)

            self.assertEqual(403, ctx.exception.status_code)

    async def test_run_routes_blocked(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config_id = _write_share_project(root)
            _write_share_policy(root, SharePolicy(allowRun=False))
            state = await self._build_state(root)
            run_request = RunCodeRequest(
                projectConfigId=project_config_id,
                sectionId=create_new_id(),
                cliId=None,
            )

            with self.assertRaises(HTTPException) as ctx:
                await route_run_code(run_request, state)

            self.assertEqual(403, ctx.exception.status_code)

            kill_request = KillSubprocessesRequest(
                projectConfigId=project_config_id,
            )

            with self.assertRaises(HTTPException) as ctx:
                await route_kill_subprocesses(kill_request, state)

            self.assertEqual(403, ctx.exception.status_code)


if __name__ == "__main__":
    unittest.main()
