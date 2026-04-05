import asyncio
import importlib.util
import sys
import textwrap
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
