from typing import TYPE_CHECKING

from mcp.types import TextContent

from setta.mcp.namespacing import (
    SETTA_MCP_SERVER_ID,
    build_namespaced_tool_name,
    split_namespaced_tool_name,
)
from setta.project_state.project_manager_types import (
    GetLatestLspDiagnosticsRequest,
    GetLatestProjectStateSummaryRequest,
)
from setta.project_state.project_state_summary_types import ProjectStateSummary
from setta.types.chat import Chat
from setta.types.chat_messages import (
    AssistantChatMessage,
    ToolCall,
    ToolCallFunction,
    ToolChatMessage,
)
from setta.types.chat_stream_events import ToolResultEvent
from setta.types.id import ID
from setta.types.lsp import SettaProjectConfigDiagnostics
from setta.types.section_impls import SectionType
from setta.utils.timestamps import get_now_timestamp

if TYPE_CHECKING:
    from setta.project_state.project_manager_switcher import ProjectManagerSwitcher
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

POST_TOOL_LINT_TOOL_BASE_NAME = "post_tool_lint"
POST_TOOL_LINT_SPECIFIER_NAMES = {
    "architecture",
    "arch",
    "backbone",
    "dataset",
    "dataset_name",
    "loss_name",
    "metric_name",
    "model_name",
    "optimizer_name",
    "scheduler_name",
}


class PostToolLinter:
    def __init__(
        self,
        project_manager_switcher: "ProjectManagerSwitcher",
        websocket_msg_handler: "WMHFrontendSender",
        search_tool_name: str,
    ) -> None:
        self.project_manager_switcher = project_manager_switcher
        self.websocket_msg_handler = websocket_msg_handler
        self.search_tool_name = search_tool_name
        self.tool_name = build_namespaced_tool_name(
            SETTA_MCP_SERVER_ID, POST_TOOL_LINT_TOOL_BASE_NAME
        )

    async def maybe_run(
        self,
        chat: Chat,
        assistant_message: AssistantChatMessage,
    ) -> ToolChatMessage | None:
        if not self._should_run(assistant_message):
            return None

        project_config_id = chat.projectConfigId
        project_manager = self.project_manager_switcher.get(project_config_id)
        summary = await project_manager.get_latest_project_state_summary(
            GetLatestProjectStateSummaryRequest(projectConfigId=project_config_id)
        )
        diagnostics = await project_manager.get_latest_lsp_diagnostics(
            GetLatestLspDiagnosticsRequest(projectConfigId=project_config_id)
        )
        lint_messages = self._build_lint_messages(summary, diagnostics)
        if not lint_messages:
            return None

        tool_call = ToolCall(
            function=ToolCallFunction(
                name=self.tool_name,
                arguments={},
            )
        )
        if assistant_message.tool_calls is None:
            assistant_message.tool_calls = []
        assistant_message.tool_calls.append(tool_call)

        started_at = get_now_timestamp()
        lint_text = self._format_lint_content(lint_messages)
        completed_at = get_now_timestamp()
        tool_chat_message = ToolChatMessage(
            tool_call_id=tool_call.id,
            tool_name=self.tool_name,
            arguments={},
            content=[TextContent(type="text", text=lint_text)],
            is_error=False,
            result={"issueCount": len(lint_messages), "issues": lint_messages},
            started_at=started_at,
            completed_at=completed_at,
        )
        await self.websocket_msg_handler.send_streaming_response(
            chat.id,
            ToolResultEvent(result=tool_chat_message),
        )
        return tool_chat_message

    def _should_run(self, assistant_message: AssistantChatMessage) -> bool:
        tool_calls = assistant_message.tool_calls or []
        for tool_call in tool_calls:
            tool_name = tool_call.function.name.strip()
            if not tool_name:
                continue
            if tool_name == self.search_tool_name:
                continue
            if tool_name == self.tool_name:
                continue
            if self._is_setta_tool_name(tool_name):
                return True
        return False

    def _build_lint_messages(
        self,
        summary: ProjectStateSummary,
        diagnostics: SettaProjectConfigDiagnostics,
    ) -> list[str]:
        section_name_by_id: dict[ID, str] = {}
        param_info_by_id: dict[ID, tuple[str, str, str | None]] = {}
        for section in summary.sections:
            section_name_by_id[section.sectionId] = section.coreName
            for param in section.parameters:
                param_info_by_id[param.paramId] = (
                    section.coreName,
                    param.name,
                    param.valuePreview,
                )

        messages: list[str] = []
        seen: set[str] = set()

        def add(message: str) -> None:
            if message in seen:
                return
            seen.add(message)
            messages.append(message)

        for section_id, section_errors in diagnostics.errors.items():
            section_name = section_name_by_id.get(section_id, f"Section {section_id}")
            for message in section_errors.callable:
                add(self._format_lsp_message(section_name, None, message))
            for param_id, param_messages in section_errors.params.items():
                param_info = param_info_by_id.get(param_id)
                if param_info:
                    section_label, param_name, _ = param_info
                else:
                    section_label = section_name
                    param_name = f"param {param_id}"
                for message in param_messages:
                    add(self._format_lsp_message(section_label, param_name, message))

        for section in summary.sections:
            if section.sectionType != SectionType.GlobalVariables:
                continue
            for param in section.parameters:
                if param.name not in POST_TOOL_LINT_SPECIFIER_NAMES:
                    continue
                location = f"{section.coreName}.{param.name}"
                add(
                    "Style: "
                    f"{location} is a string selector; bind a Callable section instead."
                )
                if self._looks_like_unquoted_string(param.valuePreview):
                    add(
                        "Literal: "
                        f"{location} value `{param.valuePreview}` looks unquoted; "
                        "wrap string literals in quotes."
                    )

        return messages

    def _format_lint_content(self, messages: list[str]) -> str:
        lines = ["Post-tool lint (Setta style):"]
        for message in messages:
            lines.append(f"- {message}")
        return "\n".join(lines)

    def _format_lsp_message(
        self,
        section_name: str,
        param_name: str | None,
        message: str,
    ) -> str:
        location = section_name
        if param_name:
            location = f"{section_name}.{param_name}"
        hint = ""
        if self._is_undefined_symbol_message(message):
            hint = (
                " If this should be a string literal, wrap it in quotes or "
                "configure a Callable section."
            )
        return f"LSP: {location}: {message}{hint}"

    def _is_undefined_symbol_message(self, message: str) -> bool:
        lowered = message.lower()
        return any(
            pattern in lowered
            for pattern in (
                "is not defined",
                "has no attribute",
                "cannot access member",
            )
        )

    def _looks_like_unquoted_string(self, value: str | None) -> bool:
        if not value:
            return False
        stripped = value.strip()
        if not stripped:
            return False
        if "'" in stripped or '"' in stripped:
            return False
        if stripped in {"True", "False", "None"}:
            return False
        return stripped.isidentifier()

    @staticmethod
    def _is_setta_tool_name(tool_name: str) -> bool:
        server_id, _ = split_namespaced_tool_name(tool_name)
        return server_id == SETTA_MCP_SERVER_ID
