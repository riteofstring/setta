from pathlib import Path
from tempfile import TemporaryDirectory

from setta.database.db_objs import DBE
from setta.llm.agent_runner import AgentRunner
from setta.mcp.client import MultiMCPClient
from setta.types.chat_messages import (
    ChatFileAttachment,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.llm_config import AllLLMConfigs, LLMConfig
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender
from setta.websockets.websocket_manager import WebsocketManager


def _build_runner(dbe: DBE, config: AllLLMConfigs) -> AgentRunner:
    websocket_manager = WebsocketManager()
    frontend_sender = WMHFrontendSender(websocket_manager, share_mode=False)
    mcp_client = MultiMCPClient(config.mcpServers, disabled=True)
    runner = AgentRunner(dbe, mcp_client, frontend_sender)
    runner.update_config(config)
    runner.update_api_keys(dbe.read_dot_env())
    return runner


def test_build_llm_request_payload_inlines_attachments() -> None:
    with TemporaryDirectory() as tmpdir:
        dbe = DBE(Path(tmpdir) / "setta_files")
        attachment_path = dbe.path / "attachments" / "notes.txt"
        attachment_text = "Hello from attachment."
        dbe.write(attachment_path, attachment_text, mode="w")
        attachment = ChatFileAttachment(
            id=str(attachment_path),
            name="notes.txt",
            mimeType="text/plain",
            size=len(attachment_text),
        )
        message = UserChatMessage(
            content=[MessageTextContent(text="Hello")],
            attachments=[attachment],
        )
        config = AllLLMConfigs(
            configs={"primary": LLMConfig(id="primary", model="gpt-test")},
            mcpServers={},
        )
        runner = _build_runner(dbe, config)

        payload = runner._build_llm_request_payload(
            llm_config=config.configs["primary"],
            messages=[message],
            thinking=False,
            system_prompt="System prompt",
            allowlist=None,
        )

        messages = payload["messages"]
        assert len(messages) == 2
        user_payload = messages[1]
        assert "attachments" not in user_payload
        content = user_payload["content"]
        assert content[0]["text"] == "Hello"
        assert content[1]["text"].startswith("[Attachment: notes.txt]")
        assert attachment_text in content[1]["text"]
