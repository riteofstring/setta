import contextlib
import importlib.util
import json
import pathlib
import subprocess
import sys
import types

import pytest
from setta.sdk_contracts.generated import (
    ListenerDependencyCatalog,
    ListenerDependencyCatalogEntry,
    ListenerRenderedDependencyValue,
    ListenerRenderedDependencyValues,
    LocalCoreCommandEnvelope,
    LocalCoreListenerRealtimeDelta,
    LocalCoreRenderRealtimeDependencyValuesRequest,
)
from setta.types.generated.go_shared_types import (
    DependencyValueType,
    LiteralDependencyValue,
    SectionDependencyKey,
    SectionParamDependencyKey,
)
from setta.types.id import ID

_REPO_ROOT = pathlib.Path(__file__).resolve().parents[2]
_BACKEND_ROOT = _REPO_ROOT / "backend"


@contextlib.contextmanager
def _loaded_local_core_module() -> types.ModuleType:
    added_backend_path = False
    backend_path = str(_BACKEND_ROOT)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)
        added_backend_path = True

    import setta  # noqa: F401

    previous_api_module = sys.modules.get("setta.api")
    previous_local_core_module = sys.modules.get("setta.api.local_core")

    api_module = types.ModuleType("setta.api")
    api_module.__path__ = [str(_BACKEND_ROOT / "setta" / "api")]
    sys.modules["setta.api"] = api_module

    spec = importlib.util.spec_from_file_location(
        "setta.api.local_core",
        _BACKEND_ROOT / "setta" / "api" / "local_core.py",
    )
    assert spec is not None and spec.loader is not None
    local_core_module = importlib.util.module_from_spec(spec)
    sys.modules["setta.api.local_core"] = local_core_module
    try:
        spec.loader.exec_module(local_core_module)
        yield local_core_module
    finally:
        if previous_local_core_module is None:
            sys.modules.pop("setta.api.local_core", None)
        else:
            sys.modules["setta.api.local_core"] = previous_local_core_module
        if previous_api_module is None:
            sys.modules.pop("setta.api", None)
        else:
            sys.modules["setta.api"] = previous_api_module
        if added_backend_path:
            sys.path.remove(backend_path)


def _dependency_key_tuple(
    dependency_key: SectionDependencyKey | SectionParamDependencyKey,
) -> tuple[str, str, str | None]:
    return (
        dependency_key.type,
        str(dependency_key.sectionId),
        str(dependency_key.codeObjId)
        if isinstance(dependency_key, SectionParamDependencyKey)
        else None,
    )


class _FakeStream:
    def __init__(self, *, line: str = "", text: str = "") -> None:
        self._line = line
        self._text = text
        self.closed = False
        self.writes: list[str] = []

    def readline(self) -> str:
        return self._line

    def read(self) -> str:
        return self._text

    def write(self, value: str) -> int:
        self.writes.append(value)
        return len(value)

    def flush(self) -> None:
        return None

    def close(self) -> None:
        self.closed = True


class _FakeProcess:
    def __init__(
        self,
        *,
        stdin: _FakeStream | None = None,
        stdout: _FakeStream | None = None,
        stderr: _FakeStream | None = None,
        poll_results: list[int | None] | None = None,
        wait_effects: list[Exception | None] | None = None,
    ) -> None:
        self.stdin = stdin
        self.stdout = stdout
        self.stderr = stderr
        self._poll_results = list(poll_results or [])
        self._last_poll_result = self._poll_results[-1] if self._poll_results else None
        self._wait_effects = list(wait_effects or [])
        self.terminate_calls = 0
        self.kill_calls = 0
        self.wait_calls: list[int] = []

    def poll(self) -> int | None:
        if self._poll_results:
            self._last_poll_result = self._poll_results.pop(0)
        return self._last_poll_result

    def terminate(self) -> None:
        self.terminate_calls += 1

    def wait(self, timeout: int) -> int:
        self.wait_calls.append(timeout)
        if self._wait_effects:
            effect = self._wait_effects.pop(0)
            if effect is not None:
                raise effect
        return 0

    def kill(self) -> None:
        self.kill_calls += 1


def test_read_line_reports_live_process_stdout_close() -> None:
    with _loaded_local_core_module() as local_core_module:
        client = local_core_module.LocalCoreClient()
        process = _FakeProcess(
            stdout=_FakeStream(),
            stderr=_FakeStream(text="ignored\n"),
            poll_results=[None],
        )

        with pytest.raises(
            RuntimeError,
            match="Setta local core closed stdout unexpectedly",
        ):
            client._read_line(process)


def test_read_line_reports_exited_process_stderr() -> None:
    with _loaded_local_core_module() as local_core_module:
        client = local_core_module.LocalCoreClient()
        process = _FakeProcess(
            stdout=_FakeStream(),
            stderr=_FakeStream(text="boom\n"),
            poll_results=[17],
        )

        with pytest.raises(
            RuntimeError,
            match="Setta local core exited before responding: boom",
        ):
            client._read_line(process)


def test_terminate_process_kills_after_timeout_and_closes_pipes() -> None:
    with _loaded_local_core_module() as local_core_module:
        client = local_core_module.LocalCoreClient()
        stdin = _FakeStream()
        stdout = _FakeStream()
        stderr = _FakeStream()
        process = _FakeProcess(
            stdin=stdin,
            stdout=stdout,
            stderr=stderr,
            poll_results=[None],
            wait_effects=[
                subprocess.TimeoutExpired(cmd="setta sdk-local-core", timeout=1),
                None,
            ],
        )

        client._terminate_process(process)

        assert process.terminate_calls == 1
        assert process.kill_calls == 1
        assert process.wait_calls == [1, 1]
        assert stdin.closed
        assert stdout.closed
        assert stderr.closed


def test_terminate_process_closes_pipes_without_signaling_exited_process() -> None:
    with _loaded_local_core_module() as local_core_module:
        client = local_core_module.LocalCoreClient()
        stdin = _FakeStream()
        stdout = _FakeStream()
        stderr = _FakeStream()
        process = _FakeProcess(
            stdin=stdin,
            stdout=stdout,
            stderr=stderr,
            poll_results=[0],
        )

        client._terminate_process(process)

        assert process.terminate_calls == 0
        assert process.kill_calls == 0
        assert process.wait_calls == []
        assert stdin.closed
        assert stdout.closed
        assert stderr.closed


def test_send_command_locked_raises_structured_local_core_error() -> None:
    with _loaded_local_core_module() as local_core_module:
        client = local_core_module.LocalCoreClient()
        stdin = _FakeStream()
        stdout = _FakeStream(
            line=json.dumps(
                {
                    "callId": "call-1",
                    "ok": False,
                    "error": "old value mismatch",
                    "details": {
                        "code": "expected_old_value_mismatch",
                        "settingId": "core.app.catalog_id",
                    },
                }
            )
            + "\n"
        )
        process = _FakeProcess(stdin=stdin, stdout=stdout, stderr=_FakeStream())
        state = local_core_module._LocalCoreProcessState(process=process, handshake=None)

        with pytest.raises(local_core_module.LocalCoreCommandError) as excinfo:
            client._send_command_locked(
                state,
                LocalCoreCommandEnvelope(
                    callId="call-1",
                    commandName="compare_and_set_app_definition_catalog_id",
                    payload={"value": "next"},
                ),
            )

        assert excinfo.value.code == "expected_old_value_mismatch"
        assert excinfo.value.details == {
            "code": "expected_old_value_mismatch",
            "settingId": "core.app.catalog_id",
        }
        assert "".join(stdin.writes) == (
            '{"callId":"call-1","commandName":"compare_and_set_app_definition_catalog_id","payload":{"value":"next"}}\n'
        )


@pytest.mark.asyncio
async def test_local_core_renders_realtime_dependency_values_via_hidden_go_cli() -> (
    None
):
    with _loaded_local_core_module() as local_core_module:
        client = local_core_module.LocalCoreClient()
        process = None
        section_key = SectionDependencyKey(
            type="Section",
            sectionId=ID("section-config"),
        )
        param_key = SectionParamDependencyKey(
            type="SectionParam",
            sectionId=ID("section-config"),
            codeObjId=ID("count"),
        )
        try:
            result = await client.render_realtime_dependency_values(
                LocalCoreRenderRealtimeDependencyValuesRequest(
                    dependencyCatalog=ListenerDependencyCatalog(
                        entries=[
                            ListenerDependencyCatalogEntry(
                                dependencyKey=section_key.model_dump(mode="json"),
                                name="Config",
                                fullPathName="Config",
                                dependencies=[param_key.model_dump(mode="json")],
                                sectionType="Dict",
                            ),
                            ListenerDependencyCatalogEntry(
                                dependencyKey=param_key.model_dump(mode="json"),
                                name="count",
                                fullPathName="Config.count",
                                codeObjType="CodeParam",
                                valueRepresentation="expression",
                            ),
                        ]
                    ),
                    currentDependencyValues=ListenerRenderedDependencyValues(
                        entries=[
                            ListenerRenderedDependencyValue(
                                dependencyKey=section_key.model_dump(mode="json"),
                                renderedValue="{'count': 1}",
                            ),
                            ListenerRenderedDependencyValue(
                                dependencyKey=param_key.model_dump(mode="json"),
                                renderedValue="1",
                            ),
                        ]
                    ),
                    deltas=[
                        LocalCoreListenerRealtimeDelta(
                            dependency=param_key.model_dump(mode="json"),
                            value=LiteralDependencyValue(
                                type=DependencyValueType.Literal,
                                payload="2",
                            ),
                        )
                    ],
                )
            )
            assert client._state is not None
            process = client._state.process
        finally:
            client.close()

        assert client._state is None
        assert process is not None
        assert process.poll() is not None
        assert process.stdin is not None and process.stdin.closed
        assert process.stdout is not None and process.stdout.closed
        assert process.stderr is not None and process.stderr.closed

        by_key = {
            _dependency_key_tuple(entry.dependencyKey): entry.renderedValue
            for entry in result.dependencyValues.entries
        }
        assert by_key[_dependency_key_tuple(param_key)] == "2"
        assert by_key[_dependency_key_tuple(section_key)] == "{'count': 2}"
