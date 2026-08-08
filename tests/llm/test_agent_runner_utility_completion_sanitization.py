from setta.llm.agent_runner import AgentRunner


def test_sanitize_utility_completion_request_strips_stream_and_tools() -> None:
    request: dict[str, object] = {
        "model": "gpt-4o-mini",
        "stream": True,
        "stream_options": {"include_usage": True},
        "tools": [{"type": "function", "function": {"name": "x"}}],
        "tool_choice": "auto",
        "functions": [{"name": "y"}],
        "function_call": {"name": "y"},
        "response_format": {"type": "json_object"},
    }

    AgentRunner._sanitize_utility_completion_request(request)  # type: ignore[arg-type]

    assert request["model"] == "gpt-4o-mini"
    assert request["stream"] is False
    assert "stream_options" not in request
    assert "tools" not in request
    assert "tool_choice" not in request
    assert "functions" not in request
    assert "function_call" not in request
    assert "response_format" not in request

