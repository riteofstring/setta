from pathlib import Path
from tempfile import TemporaryDirectory

from setta.agentic.external_adapters.opencode_sdk import OpenCodeSdkAdapter
from setta.agentic.external_adapters.base import ExternalAgentRunContext
from setta.agentic.store import create_agent_run
from setta.types.agentic import AgentProfile
from setta.types.chat_messages import (
    ChatFileAttachment,
    MessageTextContent,
    UserChatMessage,
)
from setta.types.external_agents import ExternalAgentConfig, ExternalAgentRunMode, ExternalAgentToolType
from setta.types.id import ID


def test_opencode_adapter_builds_file_parts_from_attachments() -> None:
    with TemporaryDirectory() as tmpdir:
        attachment_one = ChatFileAttachment(
            id="artifacts/one.txt",
            name="one.txt",
            mimeType="text/plain",
            size=3,
        )
        attachment_two = ChatFileAttachment(
            id="artifacts/two.png",
            name="two.png",
            mimeType="image/png",
            size=4,
        )
        message = UserChatMessage(
            content=[MessageTextContent(text="Hello")],
            attachments=[attachment_one, attachment_two],
        )
        inputs = {
            "messages": [message.model_dump(mode="json")],
            "attachmentUrls": {
                "artifacts/one.txt": "https://example.com/one.txt",
                "artifacts/two.png": "https://example.com/two.png",
            },
        }
        run = create_agent_run(profile_id=None, inputs=inputs)
        config = ExternalAgentConfig(
            name="OpenCode SDK",
            toolType=ExternalAgentToolType.opencode,
            runMode=ExternalAgentRunMode.sdk,
        )
        context = ExternalAgentRunContext(
            run=run,
            config=config,
            profile=AgentProfile(name="profile", engineConfigId=ID("engine-1")),
            project_config_id=ID("project-1"),
            chat_id=ID("chat-1"),
            section_id=None,
            inputs=inputs,
            system_prompt="",
            working_dir=Path(tmpdir),
            env={},
        )

        parts = OpenCodeSdkAdapter._build_parts(context, prompt="")

        assert parts == [
            {
                "type": "file",
                "mime": "text/plain",
                "url": "https://example.com/one.txt",
                "filename": "one.txt",
            },
            {
                "type": "file",
                "mime": "image/png",
                "url": "https://example.com/two.png",
                "filename": "two.png",
            },
        ]
