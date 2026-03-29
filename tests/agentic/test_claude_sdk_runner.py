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
