from setta.mcp.tool_metadata import get_tool_runtime_policy
from setta.mcp.tool_registry import (
    build_setta_tool_manager,
    ensure_setta_mcp_tools_loaded,
)
from setta.mcp.tools.agentic_tools import (
    get_agent_profile,
    invoke_linked_chat,
    list_agent_profiles,
    run_agent_profile,
)


def test_agentic_tools_publish_runtime_policy_metadata() -> None:
    """Keep deployment/share policy checks attached to the tool definitions."""

    ensure_setta_mcp_tools_loaded()
    tool_manager = build_setta_tool_manager()
    tools_by_name = {tool.name: tool for tool in tool_manager.list_tools()}

    list_policy = get_tool_runtime_policy(list_agent_profiles)
    get_policy = get_tool_runtime_policy(get_agent_profile)
    run_policy = get_tool_runtime_policy(run_agent_profile)
    linked_chat_policy = get_tool_runtime_policy(invoke_linked_chat)

    assert list_policy is not None
    assert list_policy.requiresLLM is True
    assert list_policy.startsRun is False

    assert get_policy is not None
    assert get_policy.requiresLLM is True
    assert get_policy.startsRun is False

    assert run_policy is not None
    assert run_policy.requiresLLM is True
    assert run_policy.startsRun is True

    assert linked_chat_policy is not None
    assert linked_chat_policy.requiresLLM is True
    assert linked_chat_policy.startsRun is True

    assert (
        getattr(tools_by_name["list_agent_profiles"].annotations, "requiresLLM") is True
    )
    assert (
        getattr(tools_by_name["get_agent_profile"].annotations, "requiresLLM") is True
    )
    assert (
        getattr(tools_by_name["run_agent_profile"].annotations, "requiresLLM") is True
    )
    assert getattr(tools_by_name["run_agent_profile"].annotations, "startsRun") is True
    assert (
        getattr(tools_by_name["invoke_linked_chat"].annotations, "requiresLLM") is True
    )
    assert getattr(tools_by_name["invoke_linked_chat"].annotations, "startsRun") is True
