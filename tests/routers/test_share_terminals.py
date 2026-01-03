import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from fastapi import FastAPI

from setta.database.db_objs import DBE
from setta.database.utils import create_new_id
from setta.routers.terminals import DeleteTerminalsRequest, route_delete_terminals
from setta.server_state import SettaFastAPIState
from setta.terminals.terminal_ids import build_terminal_id
from setta.types.id import ID
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.share_deployment import SharePolicy


def _write_share_project(root: Path) -> ID:
    dbe = DBE(root)
    project_config = ProjectConfig(name="share-terminals-test")
    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        defaultProjectConfigId=project_config.id,
    )
    dbe.write_project(project_state)
    return project_config.id


def _write_share_policy(root: Path, policy: SharePolicy) -> None:
    dbe = DBE(root)
    dbe.write_json(root / "share_policy.json", policy.model_dump())


class ShareTerminalRouteTests(unittest.IsolatedAsyncioTestCase):
    async def _build_state(self, root: Path) -> SettaFastAPIState:
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            share_mode=True,
            share_deployment_root=root,
        )
        await state.wait_until_ready()
        return state

    async def test_delete_terminals_scopes_to_share_session(self) -> None:
        with TemporaryDirectory() as tmpdir:
            root = Path(tmpdir)
            project_config_id = _write_share_project(root)
            _write_share_policy(root, SharePolicy(allowRun=True))
            state = await self._build_state(root)
            session_a = state.share_session_store.create_session()
            session_b = state.share_session_store.create_session()
            section_id = create_new_id()
            terminal_id_a = build_terminal_id(section_id, session_a.id)
            terminal_id_b = build_terminal_id(section_id, session_b.id)

            state.terminals.new_terminal(
                project_config_id,
                terminal_id_a,
                share_session_id=session_a.id,
            )
            state.terminals.new_terminal(
                project_config_id,
                terminal_id_b,
                share_session_id=session_b.id,
            )
            self.addAsyncCleanup(
                state.terminals.delete_terminals,
                [terminal_id_a, terminal_id_b],
            )

            await route_delete_terminals(
                DeleteTerminalsRequest(sectionIds=[section_id]),
                state,
                share_session_id=session_a.id,
            )

            self.assertNotIn(terminal_id_a, state.terminals.PTY_PIDS)
            self.assertIn(terminal_id_b, state.terminals.PTY_PIDS)


if __name__ == "__main__":
    unittest.main()
