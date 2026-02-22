from typing import Any

from mcp.server.fastmcp.server import Context

from setta.agentic.agentic_scope import AgenticContext
from setta.agentic.completion_report import (
    CheckResult,
    CompletionStatusReport,
    build_completion_status_report,
)
from setta.agentic.store import load_agent_profiles
from setta.mcp.errors import InvalidToolArgumentsError
from setta.mcp.tool_metadata import ToolAccessMetadata, attach_tool_access
from setta.mcp.tool_setup import setta_init_tool, setta_tool
from setta.types.agentic import AgentProfile, AgentProfileList, AgentRun
from setta.types.id import ID


@setta_init_tool
def set_agentic_context(
    *,
    projectConfigId: ID,
    chatId: ID | None = None,
    sectionId: ID | None = None,
    frontendWebsocketId: str | None = None,
    allowUnscoped: bool = False,
    ctx: Context,
) -> dict[str, Any]:
    """
    Register agentic context for this MCP session before any tool calls.

    Args:
        projectConfigId: Active project config id.
        chatId: Chat id for the agent run.
        sectionId: Chat section id (required unless allowUnscoped=true).
        frontendWebsocketId: Frontend websocket id for reveal routing affinity.
        allowUnscoped: Allow an unscoped/project-level context (required when sectionId is omitted).
    """
    if sectionId is None and not allowUnscoped:
        raise InvalidToolArgumentsError(
            "sectionId is required unless allowUnscoped is true."
        )
    if sectionId is not None and allowUnscoped:
        raise InvalidToolArgumentsError(
            "allowUnscoped requires sectionId to be omitted."
        )
    ctx.fastmcp.set_agentic_context_for_session(
        ctx,
        AgenticContext(
            project_config_id=projectConfigId,
            chat_id=chatId,
            section_id=sectionId,
            frontend_websocket_id=(
                frontendWebsocketId.strip()
                if isinstance(frontendWebsocketId, str)
                and frontendWebsocketId.strip() != ""
                else None
            ),
            allow_unscoped=allowUnscoped,
        ),
    )
    return {"status": "ok"}


@setta_tool
def report_completion_status(
    *,
    completionIntent: bool,
    requiresVerification: bool,
    checkResults: list[CheckResult] | None = None,
    taskId: str | None = None,
) -> CompletionStatusReport:
    """
    Report structured completion intent and verification evidence for the active task.
    """
    return build_completion_status_report(
        task_id=taskId,
        completion_intent=completionIntent,
        requires_verification=requiresVerification,
        check_results=list(checkResults or []),
    )


attach_tool_access(
    report_completion_status,
    ToolAccessMetadata(accessType="structural"),
)


@setta_tool
def list_agent_profiles(ctx: Context) -> AgentProfileList:
    """
    List available agent profiles stored in the workspace.
    """
    profiles = load_agent_profiles(ctx.fastmcp.state.dbe)
    return AgentProfileList(profiles=profiles)


attach_tool_access(
    list_agent_profiles,
    ToolAccessMetadata(accessType="read"),
)


@setta_tool
def get_agent_profile(profileId: ID, ctx: Context) -> AgentProfile:
    """
    Fetch a single agent profile by id.
    Args:
        profileId: The agent profile id.
    """
    profiles = load_agent_profiles(ctx.fastmcp.state.dbe)
    for profile in profiles:
        if profile.id == profileId:
            return profile
    raise KeyError(f"Agent profile {profileId} not found")


attach_tool_access(
    get_agent_profile,
    ToolAccessMetadata(accessType="read"),
)


@setta_tool
async def run_agent_profile(
    profileId: ID,
    ctx: Context,
    inputs: dict[str, Any] | None = None,
) -> AgentRun:
    """
    Start an agent run using the specified profile.
    Args:
        profileId: The agent profile id.
        inputs: Input payload for the run.
    """
    profiles = load_agent_profiles(ctx.fastmcp.state.dbe)
    for profile in profiles:
        if profile.id == profileId:
            runner = ctx.fastmcp.state.agent_runner
            if runner.disabled:
                raise RuntimeError("Agent runner is not available")
            return await runner.run_sub_agent(profile, inputs)
    raise KeyError(f"Agent profile {profileId} not found")


attach_tool_access(
    run_agent_profile,
    ToolAccessMetadata(accessType="structural"),
)
