from typing import Any

from mcp.server.fastmcp.server import Context

from setta.agentic.agentic_scope import AgenticContext
from setta.agentic.store import load_agent_profiles
from setta.mcp.tool_setup import setta_init_tool, setta_tool
from setta.types.agentic import AgentProfile, AgentProfileList, AgentRun
from setta.types.id import ID


@setta_init_tool
def set_agentic_context(
    *,
    projectConfigId: ID,
    chatId: ID | None = None,
    sectionId: ID | None = None,
    ctx: Context,
) -> dict[str, Any]:
    """
    Register agentic context for this MCP session before any tool calls.

    Args:
        projectConfigId: Active project config id.
        chatId: Chat id for the agent run.
        sectionId: Chat section id (omit for Project Chat).
    """
    ctx.fastmcp.set_agentic_context_for_session(
        ctx,
        AgenticContext(
            project_config_id=projectConfigId,
            chat_id=chatId,
            section_id=sectionId,
        ),
    )
    return {"status": "ok"}


@setta_tool
def list_agent_profiles(ctx: Context) -> AgentProfileList:
    """
    List available agent profiles stored in the workspace.
    """
    profiles = load_agent_profiles(ctx.fastmcp.state.dbe)
    return AgentProfileList(profiles=profiles)


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
