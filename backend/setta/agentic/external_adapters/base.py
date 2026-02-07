from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, AsyncIterator, Protocol

from setta.types.agentic import AgentProfile, AgentRun
from setta.types.chat_stream_events import LLMStreamingResponseChunk
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.types.id import ID


@dataclass(frozen=True)
class ExternalAgentRunContext:
    run: AgentRun
    config: ExternalAgentConfig
    profile: AgentProfile | None
    project_config_id: ID
    chat_id: ID
    section_id: ID | None
    inputs: dict[str, Any] | None
    system_prompt: str
    working_dir: Path
    env: dict[str, str]
    cleanup_paths: tuple[Path, ...] = field(default_factory=tuple)


@dataclass(frozen=True)
class ExternalAgentStreamEvent:
    raw: dict[str, Any]
    stream_chunk: LLMStreamingResponseChunk | None = None


@dataclass
class ExternalAgentRunHandle:
    run_id: ID
    process: Any | None = None
    session_id: str | None = None
    thread_id: str | None = None
    return_code: int | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


class ExternalAgentAdapter(Protocol):
    tool_type: ExternalAgentToolType
    supported_run_modes: set[ExternalAgentRunMode]

    async def start_run(
        self, context: ExternalAgentRunContext
    ) -> ExternalAgentRunHandle:
        raise NotImplementedError

    async def stream_events(
        self, handle: ExternalAgentRunHandle, context: ExternalAgentRunContext
    ) -> AsyncIterator[ExternalAgentStreamEvent]:
        raise NotImplementedError

    async def cancel_run(self, handle: ExternalAgentRunHandle) -> None:
        raise NotImplementedError

    async def send_approval_response(
        self, handle: ExternalAgentRunHandle, approval_id: str, approved: bool
    ) -> None:
        raise NotImplementedError

    async def send_tool_response(
        self, handle: ExternalAgentRunHandle, tool_call_id: str, payload: dict[str, Any]
    ) -> None:
        raise NotImplementedError
