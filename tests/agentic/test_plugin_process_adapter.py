import asyncio
from dataclasses import replace
import json
import sys
from pathlib import Path

import pytest

from setta.agentic.external_adapters.base import (
    ExternalAgentRunContext,
    ExternalAgentRunHandle,
)
from setta.agentic.external_adapters.plugin_process import (
    PluginProcessExternalAgentAdapter,
    _PLUGIN_ADAPTER_STDERR_MAX_LINES,
)
from setta.types.agentic import AgentRun
from setta.types.chat_stream_events import (
    MessageDeltaEvent,
    MessageFinalizedEvent,
    MessageStartEvent,
    MessageStopEvent,
)
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)
from setta.types.id import ID


def _build_adapter() -> PluginProcessExternalAgentAdapter:
    return PluginProcessExternalAgentAdapter(
        adapter_id="fixture-plugin:adapter",
        name="Fixture Plugin Adapter",
        supported_run_modes={ExternalAgentRunMode.sdk},
        command=sys.executable,
        args=(),
        default_model=None,
    )


def _build_context(tmp_path: Path) -> ExternalAgentRunContext:
    return ExternalAgentRunContext(
        run=AgentRun(id=ID("plugin-process-run")),
        config=ExternalAgentConfig(
            id=ID("plugin-process-config"),
            name="Plugin Process Adapter",
            toolType=ExternalAgentToolType.plugin,
            pluginAdapterId="fixture-plugin:adapter",
            runMode=ExternalAgentRunMode.sdk,
        ),
        profile=None,
        project_config_id=ID("project-1"),
        chat_id=ID("chat-1"),
        section_id=ID("section-1"),
        inputs={"prompt": "hello"},
        system_prompt="system prompt",
        working_dir=tmp_path,
        env={},
    )


@pytest.mark.asyncio
async def test_plugin_process_stream_events_supports_plain_text_fallback(
    tmp_path: Path,
) -> None:
    # Non-JSON stdout lines should still stream as assistant message deltas.
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-u",
        "-c",
        (
            "import json,sys\n"
            "sys.stdout.write('plain text output\\n')\n"
            "sys.stdout.flush()\n"
            "sys.stdout.write(json.dumps({'type':'done','returnCode':0}) + '\\n')\n"
            "sys.stdout.flush()\n"
        ),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    adapter = _build_adapter()
    context = _build_context(tmp_path)
    handle = ExternalAgentRunHandle(
        run_id=ID("plugin-process-run"),
        process=process,
        metadata={"stderr_lines": []},
    )

    events = [event async for event in adapter.stream_events(handle, context)]
    stream_chunks = [event.stream_chunk for event in events if event.stream_chunk]

    assert isinstance(stream_chunks[0], MessageStartEvent)
    assert isinstance(stream_chunks[1], MessageDeltaEvent)
    if isinstance(stream_chunks[1], MessageDeltaEvent):
        assert stream_chunks[1].content[0].text == "plain text output"
    assert isinstance(stream_chunks[2], MessageStopEvent)
    assert isinstance(stream_chunks[3], MessageFinalizedEvent)
    if isinstance(stream_chunks[3], MessageFinalizedEvent):
        assert stream_chunks[3].message.content[0].text == "plain text output"
    assert handle.return_code == 0


@pytest.mark.asyncio
async def test_plugin_process_stream_stderr_caps_lines() -> None:
    # stderr buffering should keep only the newest bounded tail.
    reader = asyncio.StreamReader()
    stderr_lines: list[str] = []
    total_lines = _PLUGIN_ADAPTER_STDERR_MAX_LINES + 11
    for idx in range(total_lines):
        reader.feed_data(f"stderr-{idx}\n".encode("utf-8"))
    reader.feed_eof()

    await PluginProcessExternalAgentAdapter._stream_stderr(reader, stderr_lines)

    assert len(stderr_lines) == _PLUGIN_ADAPTER_STDERR_MAX_LINES
    assert stderr_lines[0] == f"stderr-{total_lines - _PLUGIN_ADAPTER_STDERR_MAX_LINES}"
    assert stderr_lines[-1] == f"stderr-{total_lines - 1}"


@pytest.mark.asyncio
async def test_plugin_process_cancel_run_kills_when_terminate_hangs() -> None:
    # Cancel should escalate to kill when the process ignores terminate.
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-u",
        "-c",
        (
            "import signal,time\n"
            "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
            "time.sleep(30)\n"
        ),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    adapter = _build_adapter()
    handle = ExternalAgentRunHandle(
        run_id=ID("plugin-process-run-cancel"),
        process=process,
    )

    await adapter.cancel_run(handle)
    return_code = await process.wait()
    assert return_code is not None


@pytest.mark.asyncio
async def test_plugin_process_send_approval_response_writes_json_line() -> None:
    # Approval responses should be sent as newline-delimited JSON payloads.
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-u",
        "-c",
        (
            "import sys\n"
            "line = sys.stdin.readline()\n"
            "sys.stdout.write(line)\n"
            "sys.stdout.flush()\n"
        ),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    adapter = _build_adapter()
    handle = ExternalAgentRunHandle(
        run_id=ID("plugin-process-run-approval"),
        process=process,
    )

    await adapter.send_approval_response(handle, "approval-1", True)
    assert process.stdout is not None
    echoed = await process.stdout.readline()
    payload = json.loads(echoed.decode("utf-8"))
    await process.wait()

    assert payload == {
        "type": "approval_response",
        "approvalId": "approval-1",
        "approved": True,
    }


@pytest.mark.asyncio
async def test_plugin_process_send_tool_response_writes_json_line() -> None:
    # Tool responses should merge provided payload fields into the base envelope.
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        "-u",
        "-c",
        (
            "import sys\n"
            "line = sys.stdin.readline()\n"
            "sys.stdout.write(line)\n"
            "sys.stdout.flush()\n"
        ),
        stdin=asyncio.subprocess.PIPE,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    adapter = _build_adapter()
    handle = ExternalAgentRunHandle(
        run_id=ID("plugin-process-run-tool"),
        process=process,
    )

    await adapter.send_tool_response(
        handle,
        "tool-call-1",
        {"answers": {"Language": "Python"}},
    )
    assert process.stdout is not None
    echoed = await process.stdout.readline()
    payload = json.loads(echoed.decode("utf-8"))
    await process.wait()

    assert payload == {
        "type": "tool_response",
        "toolCallId": "tool-call-1",
        "answers": {"Language": "Python"},
    }


@pytest.mark.asyncio
async def test_plugin_process_send_response_requires_process_stdin() -> None:
    # Sending approval/tool responses must fail when process stdin is unavailable.
    adapter = _build_adapter()
    handle = ExternalAgentRunHandle(run_id=ID("plugin-process-run-missing-stdin"))

    with pytest.raises(RuntimeError) as approval_exc:
        await adapter.send_approval_response(handle, "approval-1", True)
    assert "stdin not available" in str(approval_exc.value)

    with pytest.raises(RuntimeError) as tool_exc:
        await adapter.send_tool_response(handle, "tool-call-1", {"ok": True})
    assert "stdin not available" in str(tool_exc.value)


@pytest.mark.asyncio
async def test_plugin_process_start_run_writes_expected_start_payload(
    tmp_path: Path,
) -> None:
    # start_run should emit the canonical bootstrap envelope with adapter defaults.
    adapter = PluginProcessExternalAgentAdapter(
        adapter_id="fixture-plugin:adapter",
        name="Fixture Plugin Adapter",
        supported_run_modes={ExternalAgentRunMode.sdk},
        command=sys.executable,
        args=(
            "-u",
            "-c",
            (
                "import json,sys\n"
                "line = sys.stdin.readline()\n"
                "sys.stdout.write(line)\n"
                "sys.stdout.flush()\n"
                "sys.stdout.write(json.dumps({'type':'done','returnCode':0}) + '\\n')\n"
                "sys.stdout.flush()\n"
            ),
        ),
        default_model="adapter-default-model",
    )
    context = _build_context(tmp_path)

    handle = await adapter.start_run(context)
    assert handle.process is not None
    assert handle.process.stdout is not None
    first_line = await handle.process.stdout.readline()
    payload = json.loads(first_line.decode("utf-8"))
    await handle.process.wait()

    assert payload["type"] == "setta_external_agent_start"
    assert payload["adapterId"] == "fixture-plugin:adapter"
    assert payload["runId"] == str(context.run.id)
    assert payload["runMode"] == context.config.runMode.value
    assert payload["model"] == "adapter-default-model"
    assert payload["workingDir"] == str(context.working_dir)
    assert payload["projectConfigId"] == str(context.project_config_id)
    assert payload["chatId"] == str(context.chat_id)
    assert payload["sectionId"] == str(context.section_id)
    assert payload["inputs"] == {"prompt": "hello"}
    assert payload["systemPrompt"] == "system prompt"


@pytest.mark.asyncio
async def test_plugin_process_start_run_prefers_command_override_and_model_override(
    tmp_path: Path,
) -> None:
    # Config commandPath/defaultModel should override adapter command/default model.
    adapter = PluginProcessExternalAgentAdapter(
        adapter_id="fixture-plugin:adapter",
        name="Fixture Plugin Adapter",
        supported_run_modes={ExternalAgentRunMode.sdk},
        command="/path/that/does/not/exist",
        args=(
            "-u",
            "-c",
            (
                "import json,sys\n"
                "line = sys.stdin.readline()\n"
                "sys.stdout.write(line)\n"
                "sys.stdout.flush()\n"
                "sys.stdout.write(json.dumps({'type':'done','returnCode':0}) + '\\n')\n"
                "sys.stdout.flush()\n"
            ),
        ),
        default_model="adapter-default-model",
    )
    context = _build_context(tmp_path)
    context_with_overrides = replace(
        context,
        config=context.config.model_copy(
            update={
                "commandPath": sys.executable,
                "defaultModel": "context-model",
            }
        ),
    )

    handle = await adapter.start_run(context_with_overrides)
    assert handle.process is not None
    assert handle.process.stdout is not None
    first_line = await handle.process.stdout.readline()
    payload = json.loads(first_line.decode("utf-8"))
    await handle.process.wait()

    assert payload["model"] == "context-model"
