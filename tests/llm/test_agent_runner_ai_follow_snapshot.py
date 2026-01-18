import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


def _build_runner(dbe: DBE) -> AgentRunner:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    runner = AgentRunner(dbe, MultiMCPClient({}, disabled=True), frontend_sender)
    runner.update_config(
        AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="gpt-4o-mini",
                    provider="openai",
                    api_key_env="OPENAI_API_KEY",
                    mcpServerIds=[],
                )
            },
            mcpServers={},
        )
    )
    return runner


class AgentRunnerAIFollowSnapshotTests(unittest.IsolatedAsyncioTestCase):
    async def test_snapshot_dedupes_and_clears(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            runner = _build_runner(dbe)
            project_config_id = ID("project-1")
            chat_id = ID("chat-1")

            await runner._update_and_broadcast_ai_follow_update(
                project_config_id,
                chat_id,
                {"section": [ID("section-1"), ID("section-1"), ID("section-2")]},
            )

            snapshot = runner.get_ai_follow_snapshot(project_config_id)
            self.assertEqual(len(snapshot), 1)
            entry = snapshot[0]
            self.assertEqual(entry.chatId, chat_id)
            self.assertEqual(
                entry.idsByType["section"],
                [ID("section-1"), ID("section-2")],
            )

            await runner._update_and_broadcast_ai_follow_update(
                project_config_id,
                chat_id,
                {},
            )

            snapshot = runner.get_ai_follow_snapshot(project_config_id)
            self.assertEqual(snapshot, [])
