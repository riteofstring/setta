from mcp.server.fastmcp.server import Context
from pydantic import BaseModel

from setta.mcp.tool_setup import setta_tool
from setta.types.agentic import (
    AgentProfile,
    AgentRun,
    AgentRunStatus,
    RunEvent,
    RunEventType,
)
from setta.types.chat_messages import JSONValue
from setta.types.id import ID


class AgentProfilesList(BaseModel):
    profiles: list[AgentProfile]


@setta_tool
def list_agent_profiles(ctx: Context) -> AgentProfilesList:
    """Return all configured agent profiles."""
    profiles = ctx.fastmcp.state.dbe.read_agent_profiles()
    return AgentProfilesList(profiles=profiles)


@setta_tool
def get_agent_profile(agentProfileId: ID, ctx: Context) -> AgentProfile:
    """Return a single agent profile by id."""
    profiles = ctx.fastmcp.state.dbe.read_agent_profiles()
    for profile in profiles:
        if profile.id == agentProfileId:
            return profile
    raise KeyError(f"Agent profile not found: {agentProfileId}")


@setta_tool
def run_agent_profile(
    agentProfileId: ID,
    ctx: Context,
    inputs: JSONValue | None = None,
    llmConfigId: str | None = None,
    sectionId: ID | None = None,
) -> AgentRun:
    """Create a queued agent run for the requested profile."""
    profiles = ctx.fastmcp.state.dbe.read_agent_profiles()
    profile = None
    for item in profiles:
        if item.id == agentProfileId:
            profile = item
            break
    if profile is None:
        raise KeyError(f"Agent profile not found: {agentProfileId}")
    llm_config_id = llmConfigId or profile.llmConfigId
    run = AgentRun(
        agentProfileId=profile.id,
        sectionId=sectionId,
        llmConfigId=llm_config_id,
        inputs=inputs,
        status=AgentRunStatus.queued,
        events=[
            RunEvent(
                type=RunEventType.status,
                status=AgentRunStatus.queued,
            )
        ],
    )
    ctx.fastmcp.state.dbe.write_agent_run(run)
    ctx.fastmcp.state.agent_runner.start_run(
        run=run,
        profile=profile,
        inputs=inputs,
        llm_config_id=llm_config_id,
        section_id=sectionId,
        share_session_id=None,
    )
    return run
