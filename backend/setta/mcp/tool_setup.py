from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Callable

from setta.types.ai import IDToUUIDForLLM, UUIDToIDForLLM

if TYPE_CHECKING:
    from setta.database.db_objs import DBE
    from setta.server_state import SettaFastAPIState


@dataclass(slots=True)
class ToolRunContext:
    """Shared execution context passed into MCP tools when invoked."""

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
        return ToolRunContext(
            setta_state=self.setta_state,
            chat_id=self.chat_id,
            project_config_id=self.project_config_id,
            id_to_uuid=id_to_uuid or self.id_to_uuid.copy(),
            uuid_to_id=uuid_to_id or self.uuid_to_id.copy(),
            workspace_root=self.workspace_root,
        )


SETTA_MCP_TOOLS: list[Callable] = []


def setta_tool(fn: Callable):
    SETTA_MCP_TOOLS.append(fn)
    return fn
