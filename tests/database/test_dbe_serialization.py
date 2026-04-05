import json

from setta.database.db_objs import DBE
from setta.types.chat_messages import ToolChatMessage
from setta.types.core import Core, Variant
from setta.types.project_config import ProjectConfig
from setta.types.project_state import ProjectStateBackend
from setta.types.section_impls import ChatSectionImpl, SectionType


def test_write_project_serializes_chat_message_datetimes(tmp_path) -> None:
    dbe = DBE(tmp_path)
    project_config = ProjectConfig()

    section_id = "section-chat"
    variant_id = "variant-chat"
    impl_id = "impl-chat"

    tool_message = ToolChatMessage(tool_call_id="tool-call")
    chat_impl = ChatSectionImpl(
        id=impl_id,
        type=SectionType.Chat,
        messages=[tool_message],
        managed=True,
    )
    section_core = Core(
        id=section_id,
        name="Chat",
        variants=[variant_id],
        defaultVariant=variant_id,
    )
    section_variant = Variant(
        id=variant_id,
        name="Chat Variant",
        impl=impl_id,
        nonPresetImpls=[impl_id],
    )

    project_state = ProjectStateBackend(
        projectConfigs={project_config.id: project_config},
        projectChatWindowingByProjectConfigId={project_config.id: {}},
        defaultProjectConfigId=project_config.id,
        sections={section_id: section_core},
        sectionVariants={variant_id: section_variant},
        sectionImpls={impl_id: chat_impl},
    )

    dbe.write_project(project_state)

    payload = json.loads((tmp_path / "project.json").read_text(encoding="utf-8"))
    started_at = (
        payload.get("sectionImpls", {})
        .get(impl_id, {})
        .get("messages", [{}])[0]
        .get("started_at")
    )
    assert isinstance(started_at, str)
