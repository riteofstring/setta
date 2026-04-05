import asyncio
import importlib.util
import sys
import textwrap
from dataclasses import dataclass
from pathlib import Path


def _load_claude_sdk_runner(module_name: str):
    runner_path = (
        Path(__file__).resolve().parents[2]
        / "backend"
        / "setta"
        / "agentic"
        / "external_adapters"
        / "sidecars"
        / "claude_sdk_runner.py"
    )
    spec = importlib.util.spec_from_file_location(module_name, runner_path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(module_name, None)
    return module


def test_claude_sdk_runner_falls_back_to_types_stream_event(
    tmp_path: Path,
    monkeypatch,
) -> None:
    fake_site = tmp_path / "site"
    sdk_root = fake_site / "claude_agent_sdk"
    sdk_root.mkdir(parents=True)
    (sdk_root / "__init__.py").write_text(
        textwrap.dedent(
            """
            class AssistantMessage: pass
            class ClaudeAgentOptions:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs
            class ClaudeSDKClient:
                def __init__(self, options=None):
                    self.options = options
                async def __aenter__(self):
                    return self
                async def __aexit__(self, exc_type, exc, tb):
                    return False
                async def query(self, prompt, session_id="default"):
                    return None
                async def receive_response(self):
                    if False:
                        yield None
            class PermissionResultAllow:
                def __init__(self, behavior, updated_input=None):
                    self.behavior = behavior
                    self.updated_input = updated_input
            class PermissionResultDeny:
                def __init__(self, behavior, message, interrupt):
                    self.behavior = behavior
                    self.message = message
                    self.interrupt = interrupt
            class ResultMessage: pass
            class SystemMessage: pass
            async def query(*args, **kwargs):
                if False:
                    yield None
            """
        ),
        encoding="utf-8",
    )
    (sdk_root / "types.py").write_text(
        textwrap.dedent(
            """
            class StreamEvent:
                def __init__(self, event=None, session_id=None):
                    self.event = event
                    self.session_id = session_id
            """
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(fake_site))
    monkeypatch.delitem(sys.modules, "claude_agent_sdk", raising=False)
    monkeypatch.delitem(sys.modules, "claude_agent_sdk.types", raising=False)

    module = _load_claude_sdk_runner("test_claude_sdk_runner_types_fallback")

    from claude_agent_sdk.types import StreamEvent

    assert module.is_stream_event_message(StreamEvent(event={"type": "message_start"}))


def test_claude_sdk_runner_enriches_result_usage_with_context_usage(
    tmp_path: Path,
    monkeypatch,
) -> None:
    fake_site = tmp_path / "site"
    sdk_root = fake_site / "claude_agent_sdk"
    sdk_root.mkdir(parents=True)
    (sdk_root / "__init__.py").write_text(
        textwrap.dedent(
            """
            class AssistantMessage: pass
            class ClaudeAgentOptions:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs
            class ClaudeSDKClient:
                def __init__(self, options=None):
                    self.options = options
                async def __aenter__(self):
                    return self
                async def __aexit__(self, exc_type, exc, tb):
                    return False
                async def query(self, prompt, session_id="default"):
                    return None
                async def receive_response(self):
                    if False:
                        yield None
            class PermissionResultAllow:
                def __init__(self, behavior, updated_input=None):
                    self.behavior = behavior
                    self.updated_input = updated_input
            class PermissionResultDeny:
                def __init__(self, behavior, message, interrupt):
                    self.behavior = behavior
                    self.message = message
                    self.interrupt = interrupt
            class ResultMessage:
                def __init__(self, session_id=None, is_error=False, result=None, usage=None):
                    self.session_id = session_id
                    self.is_error = is_error
                    self.result = result
                    self.usage = usage
            class SystemMessage: pass
            async def query(*args, **kwargs):
                if False:
                    yield None
            """
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(fake_site))
    monkeypatch.delitem(sys.modules, "claude_agent_sdk", raising=False)
    module = _load_claude_sdk_runner("test_claude_sdk_runner_context_usage")

    events: list[dict] = []
    monkeypatch.setattr(module, "write_event", events.append)

    result_message = module.ResultMessage(
        session_id="session-1",
        is_error=False,
        result="ok",
        usage={"input_tokens": 12, "output_tokens": 8},
    )

    class FakeClient:
        async def get_context_usage(self):
            return {
                "totalTokens": 400,
                "rawMaxTokens": 1000,
                "maxTokens": 900,
                "autoCompactThreshold": 850,
            }

    async def run_test() -> None:
        sidecar = module.ClaudeSidecar({"type": "start"}, asyncio.StreamReader())
        await sidecar.handle_message(result_message, FakeClient())

    asyncio.run(run_test())

    assert events == [
        {
            "type": "result",
            "sessionId": "session-1",
            "isError": False,
            "result": "ok",
            "usage": {
                "input_tokens": 12,
                "output_tokens": 8,
                "contextUsedTokens": 400,
                "contextWindowTokens": 1000,
                "effectiveContextWindowTokens": 900,
                "autoCompactThresholdTokens": 850,
            },
        }
    ]


def test_claude_sdk_runner_to_jsonable_handles_common_sdk_shapes(
    tmp_path: Path,
    monkeypatch,
) -> None:
    fake_site = tmp_path / "site"
    sdk_root = fake_site / "claude_agent_sdk"
    sdk_root.mkdir(parents=True)
    (sdk_root / "__init__.py").write_text(
        textwrap.dedent(
            """
            class AssistantMessage: pass
            class ClaudeAgentOptions:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs
            class ClaudeSDKClient:
                def __init__(self, options=None):
                    self.options = options
                async def __aenter__(self):
                    return self
                async def __aexit__(self, exc_type, exc, tb):
                    return False
                async def query(self, prompt, session_id="default"):
                    return None
                async def receive_response(self):
                    if False:
                        yield None
            class PermissionResultAllow:
                def __init__(self, behavior, updated_input=None):
                    self.behavior = behavior
                    self.updated_input = updated_input
            class PermissionResultDeny:
                def __init__(self, behavior, message, interrupt):
                    self.behavior = behavior
                    self.message = message
                    self.interrupt = interrupt
            class ResultMessage: pass
            class SystemMessage: pass
            """
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(fake_site))
    monkeypatch.delitem(sys.modules, "claude_agent_sdk", raising=False)
    module = _load_claude_sdk_runner("test_claude_sdk_runner_to_jsonable")

    @dataclass
    class PlainObject:
        path: Path
        values: tuple[int, ...]

    class ModelDumpObject:
        def model_dump(self):
            return {"path": Path("/tmp/model"), "values": (1, 2)}

    class DictObject:
        def dict(self):
            return {"nested": PlainObject(path=Path("/tmp/nested"), values=(3,))}

    payload = {
        "plain": PlainObject(path=Path("/tmp/plain"), values=(4, 5)),
        "model": ModelDumpObject(),
        "dict": DictObject(),
    }

    assert module.to_jsonable(payload) == {
        "plain": {"path": "/tmp/plain", "values": [4, 5]},
        "model": {"path": "/tmp/model", "values": [1, 2]},
        "dict": {"nested": {"path": "/tmp/nested", "values": [3]}},
    }


def test_claude_sdk_runner_preserves_existing_context_usage_fields(
    tmp_path: Path,
    monkeypatch,
) -> None:
    fake_site = tmp_path / "site"
    sdk_root = fake_site / "claude_agent_sdk"
    sdk_root.mkdir(parents=True)
    (sdk_root / "__init__.py").write_text(
        textwrap.dedent(
            """
            class AssistantMessage: pass
            class ClaudeAgentOptions:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs
            class ClaudeSDKClient:
                def __init__(self, options=None):
                    self.options = options
                async def __aenter__(self):
                    return self
                async def __aexit__(self, exc_type, exc, tb):
                    return False
                async def query(self, prompt, session_id="default"):
                    return None
                async def receive_response(self):
                    if False:
                        yield None
            class PermissionResultAllow:
                def __init__(self, behavior, updated_input=None):
                    self.behavior = behavior
                    self.updated_input = updated_input
            class PermissionResultDeny:
                def __init__(self, behavior, message, interrupt):
                    self.behavior = behavior
                    self.message = message
                    self.interrupt = interrupt
            class ResultMessage: pass
            class SystemMessage: pass
            """
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(fake_site))
    monkeypatch.delitem(sys.modules, "claude_agent_sdk", raising=False)
    module = _load_claude_sdk_runner("test_claude_sdk_runner_context_usage_preserve")

    assert module.merge_context_usage(
        {
            "effectiveContextWindowTokens": 777,
            "autoCompactThresholdTokens": 666,
        },
        {
            "totalTokens": 400,
            "rawMaxTokens": 1000,
            "maxTokens": 900,
            "autoCompactThreshold": 850,
        },
    ) == {
        "contextUsedTokens": 400,
        "contextWindowTokens": 1000,
        "effectiveContextWindowTokens": 777,
        "autoCompactThresholdTokens": 666,
    }


def test_claude_sdk_runner_queries_client_with_string_prompt(
    tmp_path: Path,
    monkeypatch,
) -> None:
    fake_site = tmp_path / "site"
    sdk_root = fake_site / "claude_agent_sdk"
    sdk_root.mkdir(parents=True)
    (sdk_root / "__init__.py").write_text(
        textwrap.dedent(
            """
            query_prompts = []

            class AssistantMessage: pass
            class ClaudeAgentOptions:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs
            class ClaudeSDKClient:
                def __init__(self, options=None):
                    self.options = options
                async def __aenter__(self):
                    return self
                async def __aexit__(self, exc_type, exc, tb):
                    return False
                async def query(self, prompt, session_id="default"):
                    query_prompts.append((prompt, session_id))
                    if not isinstance(prompt, str):
                        raise AssertionError(f"expected string prompt, got {type(prompt).__name__}")
                async def receive_response(self):
                    yield ResultMessage(session_id="session-2", result="done", usage={"input_tokens": 1})
            class PermissionResultAllow:
                def __init__(self, behavior, updated_input=None):
                    self.behavior = behavior
                    self.updated_input = updated_input
            class PermissionResultDeny:
                def __init__(self, behavior, message, interrupt):
                    self.behavior = behavior
                    self.message = message
                    self.interrupt = interrupt
            class ResultMessage:
                def __init__(self, session_id=None, is_error=False, result=None, usage=None):
                    self.session_id = session_id
                    self.is_error = is_error
                    self.result = result
                    self.usage = usage
            class SystemMessage: pass
            """
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(fake_site))
    monkeypatch.delitem(sys.modules, "claude_agent_sdk", raising=False)
    module = _load_claude_sdk_runner("test_claude_sdk_runner_string_prompt")

    events: list[dict] = []
    monkeypatch.setattr(module, "write_event", events.append)

    async def run_test() -> int:
        reader = asyncio.StreamReader()
        reader.feed_eof()
        sidecar = module.ClaudeSidecar(
            {
                "type": "start",
                "prompt": "Hi",
                "resume": "session-2",
            },
            reader,
        )
        return await sidecar.run()

    assert asyncio.run(run_test()) == 0
    assert module.sys.modules["claude_agent_sdk"].query_prompts == [("Hi", "session-2")]
    assert events == [
        {
            "type": "result",
            "sessionId": "session-2",
            "isError": False,
            "result": "done",
            "usage": {"input_tokens": 1},
        }
    ]


def test_claude_sdk_runner_normalizes_tool_names(
    tmp_path: Path,
    monkeypatch,
) -> None:
    fake_site = tmp_path / "site"
    sdk_root = fake_site / "claude_agent_sdk"
    sdk_root.mkdir(parents=True)
    (sdk_root / "__init__.py").write_text(
        textwrap.dedent(
            """
            class AssistantMessage: pass
            class ClaudeAgentOptions:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs
            class ClaudeSDKClient:
                def __init__(self, options=None):
                    self.options = options
                async def __aenter__(self):
                    return self
                async def __aexit__(self, exc_type, exc, tb):
                    return False
                async def query(self, prompt, session_id="default"):
                    return None
                async def receive_response(self):
                    if False:
                        yield None
            class PermissionResultAllow:
                def __init__(self, behavior, updated_input=None):
                    self.behavior = behavior
                    self.updated_input = updated_input
            class PermissionResultDeny:
                def __init__(self, behavior, message, interrupt):
                    self.behavior = behavior
                    self.message = message
                    self.interrupt = interrupt
            class ResultMessage: pass
            class SystemMessage: pass
            """
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(fake_site))
    monkeypatch.delitem(sys.modules, "claude_agent_sdk", raising=False)

    module = _load_claude_sdk_runner("test_claude_sdk_runner_tool_normalization")

    assert module.normalize_tool_name("  mcp__setta__read_file  ") == "setta__read_file"
    assert module.normalize_tool_name("setta_read_file") == "setta__read_file"
    assert module.normalize_tool_name("question") == "AskUserQuestion"
    assert module.normalize_tool_name("QUESTION") == "AskUserQuestion"
    assert module.normalize_tool_name("mcp__question") == "question"


def test_claude_sdk_runner_builds_normalized_options(
    tmp_path: Path,
    monkeypatch,
) -> None:
    fake_site = tmp_path / "site"
    sdk_root = fake_site / "claude_agent_sdk"
    sdk_root.mkdir(parents=True)
    (sdk_root / "__init__.py").write_text(
        textwrap.dedent(
            """
            class AssistantMessage: pass
            class ClaudeAgentOptions:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs
            class ClaudeSDKClient:
                def __init__(self, options=None):
                    self.options = options
                async def __aenter__(self):
                    return self
                async def __aexit__(self, exc_type, exc, tb):
                    return False
                async def query(self, prompt, session_id="default"):
                    return None
                async def receive_response(self):
                    if False:
                        yield None
            class PermissionResultAllow:
                def __init__(self, behavior, updated_input=None):
                    self.behavior = behavior
                    self.updated_input = updated_input
            class PermissionResultDeny:
                def __init__(self, behavior, message, interrupt):
                    self.behavior = behavior
                    self.message = message
                    self.interrupt = interrupt
            class ResultMessage: pass
            class SystemMessage: pass
            """
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(fake_site))
    monkeypatch.delitem(sys.modules, "claude_agent_sdk", raising=False)
    module = _load_claude_sdk_runner("test_claude_sdk_runner_build_options")

    mcp_config = tmp_path / "mcp.json"
    mcp_config.write_text(
        '{"mcpServers":{"local":{"command":"setta","args":["mcp"]}}}',
        encoding="utf-8",
    )

    sidecar = module.ClaudeSidecar(
        {
            "type": "start",
            "systemPrompt": "  Follow repo policy.  ",
            "cwd": "  /tmp/workspace  ",
            "env": {"A": "1", "B": 2, "C": None, 4: "skip"},
            "cliPath": "  /usr/local/bin/claude  ",
            "allowedTools": [" AskUserQuestion ", "bash", "bash"],
            "model": "  claude-4  ",
            "resume": "  session-9  ",
            "permissionMode": "  plan  ",
            "maxTurns": 4,
            "maxThinkingTokens": 900,
            "sandbox": {"mode": "workspace-write"},
            "settingSources": [" user ", "", "project"],
            "mcpConfigPath": str(mcp_config),
        },
        None,
    )

    options = sidecar.build_options().kwargs

    assert options["include_partial_messages"] is True
    assert callable(options["can_use_tool"])
    assert options["extra_args"] == {"debug-to-stderr": None}
    assert callable(options["stderr"])
    assert options["system_prompt"] == {
        "type": "preset",
        "preset": "claude_code",
        "append": "Follow repo policy.",
    }
    assert options["cwd"] == "/tmp/workspace"
    assert options["env"] == {"A": "1", "B": "2"}
    assert options["cli_path"] == "/usr/local/bin/claude"
    assert options["allowed_tools"] == ["question", "bash"]
    assert options["model"] == "claude-4"
    assert options["resume"] == "session-9"
    assert options["permission_mode"] == "plan"
    assert options["max_turns"] == 4
    assert options["max_thinking_tokens"] == 900
    assert options["sandbox"] == {"mode": "workspace-write"}
    assert options["setting_sources"] == ["user", "project"]
    assert options["mcp_servers"] == {
        "local": {"command": "setta", "args": ["mcp"]}
    }


def test_claude_sdk_runner_reads_approval_and_tool_commands(
    tmp_path: Path,
    monkeypatch,
) -> None:
    fake_site = tmp_path / "site"
    sdk_root = fake_site / "claude_agent_sdk"
    sdk_root.mkdir(parents=True)
    (sdk_root / "__init__.py").write_text(
        textwrap.dedent(
            """
            class AssistantMessage: pass
            class ClaudeAgentOptions:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs
            class ClaudeSDKClient:
                def __init__(self, options=None):
                    self.options = options
                async def __aenter__(self):
                    return self
                async def __aexit__(self, exc_type, exc, tb):
                    return False
                async def query(self, prompt, session_id="default"):
                    return None
                async def receive_response(self):
                    if False:
                        yield None
            class PermissionResultAllow:
                def __init__(self, behavior, updated_input=None):
                    self.behavior = behavior
                    self.updated_input = updated_input
            class PermissionResultDeny:
                def __init__(self, behavior, message, interrupt):
                    self.behavior = behavior
                    self.message = message
                    self.interrupt = interrupt
            class ResultMessage: pass
            class SystemMessage: pass
            """
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(fake_site))
    monkeypatch.delitem(sys.modules, "claude_agent_sdk", raising=False)
    module = _load_claude_sdk_runner("test_claude_sdk_runner_read_commands")

    async def run_test() -> tuple[object, object]:
        reader = asyncio.StreamReader()
        sidecar = module.ClaudeSidecar({"type": "start"}, reader)
        approval_future = asyncio.get_running_loop().create_future()
        tool_future = asyncio.get_running_loop().create_future()
        sidecar.pending_approvals["approval-1"] = module.PendingApproval(
            future=approval_future,
            tool_name=None,
            tool_input=None,
        )
        sidecar.pending_approvals["tool-1"] = module.PendingApproval(
            future=tool_future,
            tool_name="AskUserQuestion",
            tool_input={"question": "Name?"},
        )
        reader.feed_data(
            b'{"type":"approval_response","approvalId":"approval-1","approved":true}\n'
        )
        reader.feed_data(
            b'{"type":"tool_response","toolCallId":"tool-1","answers":{"name":"Ada"}}\n'
        )
        reader.feed_eof()
        await sidecar.read_commands()
        return approval_future.result(), tool_future.result()

    approval_decision, tool_decision = asyncio.run(run_test())

    assert approval_decision == module.ApprovalDecision(
        approved=True,
        updated_input=None,
    )
    assert tool_decision == module.ApprovalDecision(
        approved=True,
        updated_input={"question": "Name?", "answers": {"name": "Ada"}},
    )


def test_claude_sdk_runner_emits_normalized_assistant_message(
    tmp_path: Path,
    monkeypatch,
) -> None:
    fake_site = tmp_path / "site"
    sdk_root = fake_site / "claude_agent_sdk"
    sdk_root.mkdir(parents=True)
    (sdk_root / "__init__.py").write_text(
        textwrap.dedent(
            """
            class AssistantMessage: pass
            class ClaudeAgentOptions:
                def __init__(self, **kwargs):
                    self.kwargs = kwargs
            class ClaudeSDKClient:
                def __init__(self, options=None):
                    self.options = options
                async def __aenter__(self):
                    return self
                async def __aexit__(self, exc_type, exc, tb):
                    return False
                async def query(self, prompt, session_id="default"):
                    return None
                async def receive_response(self):
                    if False:
                        yield None
            class PermissionResultAllow:
                def __init__(self, behavior, updated_input=None):
                    self.behavior = behavior
                    self.updated_input = updated_input
            class PermissionResultDeny:
                def __init__(self, behavior, message, interrupt):
                    self.behavior = behavior
                    self.message = message
                    self.interrupt = interrupt
            class ResultMessage: pass
            class SystemMessage: pass
            """
        ),
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(fake_site))
    monkeypatch.delitem(sys.modules, "claude_agent_sdk", raising=False)
    module = _load_claude_sdk_runner("test_claude_sdk_runner_assistant_message")

    events: list[dict] = []
    monkeypatch.setattr(module, "write_event", events.append)

    message = module.AssistantMessage()
    message.session_id = " session-7 "
    message.content = [{"type": "tool_use", "name": "question"}]

    async def run_test() -> None:
        sidecar = module.ClaudeSidecar({"type": "start"}, asyncio.StreamReader())
        await sidecar.handle_message(message)

    asyncio.run(run_test())

    assert events == [
        {
            "type": "assistant_message",
            "message": {
                "session_id": " session-7 ",
                "content": [{"type": "tool_use", "name": "AskUserQuestion"}],
            },
            "sessionId": "session-7",
        }
    ]
