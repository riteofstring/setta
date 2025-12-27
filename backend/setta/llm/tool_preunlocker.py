import re
from typing import TYPE_CHECKING

from setta.mcp.tool_metadata import SettaToolAnnotations
from setta.types.chat_messages import MessageTextContent, UserChatMessage
from setta.types.section_impls import SectionType

if TYPE_CHECKING:
    from litellm.types.llms.openai import ChatCompletionToolParam

    from setta.project_state.project_state_summary_types import ProjectStateSummary
    from setta.types.chat import Chat


PREUNLOCK_MAX_TOOLS = 2
PREUNLOCK_SECTION_WEIGHT = 1

PREUNLOCK_SECTION_TYPE_CATEGORIES: dict[str, set[str]] = {
    SectionType.Callable.value: {"params"},
    SectionType.Dict.value: {"params"},
    SectionType.GlobalVariables.value: {"params"},
    SectionType.Code.value: {"code"},
    SectionType.GenPythonCode.value: {"code"},
    SectionType.Terminal.value: {"terminal"},
    SectionType.Chat.value: {"chat"},
    SectionType.Image.value: {"artifacts"},
    SectionType.Chart.value: {"artifacts"},
    SectionType.Draw.value: {"artifacts"},
    SectionType.Browser.value: {"artifacts"},
}


class ToolPreunlocker:
    def select_tools(
        self,
        chat: "Chat",
        project_summary: "ProjectStateSummary",
        *,
        available_tools: dict[str, "ChatCompletionToolParam"],
        annotations_by_name: dict[str, SettaToolAnnotations | None],
    ) -> dict[str, "ChatCompletionToolParam"]:
        if not available_tools:
            return {}
        message_text = self._extract_latest_user_text(chat)
        message_tokens = set(self._tokenize_text(message_text))
        category_weights = self._score_categories_from_sections(project_summary)
        if not message_tokens and not category_weights:
            return {}
        scored_tools = self._score_tools(
            message_tokens,
            category_weights,
            available_tools,
            annotations_by_name,
        )
        if not scored_tools:
            return {}
        ranked = sorted(scored_tools.items(), key=lambda item: (-item[1], item[0]))
        tool_names = [name for name, _ in ranked[:PREUNLOCK_MAX_TOOLS]]
        definitions = {name: available_tools[name] for name in tool_names}
        return definitions

    def _score_categories_from_sections(
        self, project_summary: "ProjectStateSummary"
    ) -> dict[str, int]:
        weights: dict[str, int] = {}
        for section in project_summary.sections:
            section_type_value = self._normalize_section_type(section.sectionType)
            categories = PREUNLOCK_SECTION_TYPE_CATEGORIES.get(section_type_value)
            if not categories:
                continue
            for category in categories:
                weights[category] = weights.get(category, 0) + PREUNLOCK_SECTION_WEIGHT
        return weights

    def _score_tools(
        self,
        message_tokens: set[str],
        category_weights: dict[str, int],
        available: dict[str, "ChatCompletionToolParam"],
        annotations_by_name: dict[str, SettaToolAnnotations | None],
    ) -> dict[str, int]:
        scores: dict[str, int] = {}
        for name, definition in available.items():
            function_payload = definition.get("function")
            description = ""
            if isinstance(function_payload, dict):
                raw_description = function_payload.get("description")
                if isinstance(raw_description, str):
                    description = raw_description
            annotations = annotations_by_name.get(name)
            score = 0
            if message_tokens:
                server_id, tool_basename = self._split_server_prefix(name)
                tags = annotations.searchTags if annotations else []
                score += self._score_tool_relevance(
                    tool_basename,
                    description,
                    tags,
                    message_tokens,
                    server_id=server_id,
                )
            category = annotations.searchCategory if annotations else None
            if category and category in category_weights:
                score += category_weights[category]
            if score <= 0:
                continue
            scores[name] = score
        return scores

    def _score_tool_relevance(
        self,
        tool_name: str,
        description: str,
        tags: list[str],
        message_tokens: set[str],
        *,
        server_id: str | None,
    ) -> int:
        name_tokens = set(self._tokenize_text(tool_name))
        description_tokens = set(self._tokenize_text(description))
        tag_tokens = {tag.lower() for tag in tags if isinstance(tag, str)}
        score = (
            3 * len(message_tokens.intersection(name_tokens))
            + 2 * len(message_tokens.intersection(tag_tokens))
            + len(message_tokens.intersection(description_tokens))
        )
        if server_id:
            server_tokens = set(self._tokenize_text(server_id))
            score += 3 * len(message_tokens.intersection(server_tokens))
        return score

    def _extract_latest_user_text(self, chat: "Chat") -> str:
        for message in reversed(chat.messages):
            if isinstance(message, UserChatMessage):
                return self._extract_message_text(message)
        return ""

    @staticmethod
    def _extract_message_text(message: UserChatMessage) -> str:
        chunks: list[str] = []
        for content in message.content:
            if isinstance(content, MessageTextContent):
                text = content.text.strip()
                if text:
                    chunks.append(text)
        return " ".join(chunks)

    @staticmethod
    def _tokenize_text(text: str) -> list[str]:
        if not text:
            return []
        return re.findall(r"[a-z0-9]+", text.lower())

    @staticmethod
    def _normalize_section_type(section_type: SectionType | str) -> str:
        if isinstance(section_type, SectionType):
            return section_type.value
        return str(section_type)

    @staticmethod
    def _split_server_prefix(tool_name: str) -> tuple[str | None, str]:
        if "__" in tool_name:
            server_id, tool_basename = tool_name.split("__", 1)
            return server_id, tool_basename
        return None, tool_name
