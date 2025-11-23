from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any, Awaitable, Callable

from setta.types.ai import IDToUUIDForLLM, UUIDToIDForLLM

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.server_state import SettaFastAPIState

JSONSchema = dict[str, Any]
ToolResult = Any
ToolHandlerReturn = ToolResult | Awaitable[ToolResult]
ToolHandler = Callable[..., ToolHandlerReturn]


class ToolRegistrationError(Exception):
    pass


class ToolLookupError(Exception):
    pass


@dataclass(slots=True)
class ToolDefinition:
    """
    Provider-agnostic definition of an MCP tool.

    The handler is stored so chat flows can execute tool calls once LiteLLM
    surfaces them, while the JSON schema is exposed to the LLM as-is.
    """

    name: str
    description: str
    parameters: JSONSchema
    handler: ToolHandler
    result_schema: JSONSchema | None = None


@dataclass(slots=True)
class ToolRunContext:
    """
    Shared execution context injected into every MCP tool handler.

    Tools get direct access to the Setta state, filesystem, and UUID mappings
    so they can translate between chat-level IDs and on-disk resources.
    """

    setta_state: "SettaFastAPIState"
    chat_id: str | None = None
    project_config_id: str | None = None
    id_to_uuid: IDToUUIDForLLM = field(default_factory=dict)
    uuid_to_id: UUIDToIDForLLM = field(default_factory=dict)
    workspace_root: Path = field(default_factory=lambda: Path.cwd())

    @property
    def dbe(self) -> "DBE":
        return self.setta_state.dbe

    def filesystem_path(self, relative_path: str | Path) -> Path:
        """
        Resolve a path relative to the workspace root for callers that need to
        read/write files on disk.
        """

        rel_path = Path(relative_path)
        if rel_path.is_absolute():
            return rel_path
        return self.workspace_root / rel_path

    def with_uuid_mapping(
        self,
        *,
        id_to_uuid: IDToUUIDForLLM | None = None,
        uuid_to_id: UUIDToIDForLLM | None = None,
    ) -> "ToolRunContext":
        """
        Return a shallow copy of the context with updated UUID mappings.
        """

        return ToolRunContext(
            setta_state=self.setta_state,
            chat_id=self.chat_id,
            project_config_id=self.project_config_id,
            id_to_uuid=id_to_uuid or self.id_to_uuid.copy(),
            uuid_to_id=uuid_to_id or self.uuid_to_id.copy(),
            workspace_root=self.workspace_root,
        )


class MCPToolRegistry:
    """
    Central registry for MCP tools exposed through LiteLLM.
    """

    def __init__(self) -> None:
        self._tools: dict[str, ToolDefinition] = {}

    def register_tool(
        self,
        handler: ToolHandler,
        *,
        name: str | None = None,
        description: str | None = None,
        parameters: JSONSchema | None = None,
        result_schema: JSONSchema | None = None,
    ) -> ToolDefinition:
        tool_name = name or handler.__name__
        if tool_name in self._tools:
            raise ToolRegistrationError(f"Tool already registered: {tool_name}")
        tool_definition = ToolDefinition(
            name=tool_name,
            description=(description or handler.__doc__ or "").strip(),
            parameters=parameters or _default_parameters_schema(),
            handler=handler,
            result_schema=result_schema,
        )
        self._tools[tool_name] = tool_definition
        return tool_definition

    def get(self, name: str) -> ToolDefinition:
        try:
            return self._tools[name]
        except KeyError as exc:
            raise ToolLookupError(f"Unknown MCP tool '{name}'") from exc

    def list_tools(self) -> list[ToolDefinition]:
        return list(self._tools.values())

    def clear(self) -> None:
        self._tools.clear()


def _default_parameters_schema() -> JSONSchema:
    """
    Temporary placeholder until argument-introspection driven schemas land.
    """

    return {"type": "object", "properties": {}, "additionalProperties": False}


TOOL_REGISTRY = MCPToolRegistry()
