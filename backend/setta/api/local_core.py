import asyncio
import os
import subprocess
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from setta import __version__
from setta.api.runtime_compat import RuntimeCompatibilityError
from setta.entrypoint import resolve_go_cli_command, resolve_go_cli_env
from setta.sdk_contracts.generated import (
    SETTA_SDK_CONTRACT_VERSION,
    LocalCoreCommandEnvelope,
    LocalCoreRenderRealtimeDependencyValuesRequest,
    LocalCoreRenderRealtimeDependencyValuesResult,
    LocalCoreResultEnvelope,
    LocalCoreVersionHandshake,
)
from setta.types.generated.go_shared_constants import (
    LOCAL_CORE_COMMAND_RENDER_REALTIME_DEPENDENCY_VALUES,
    LOCAL_CORE_PROTOCOL_VERSION,
)


@dataclass(slots=True)
class _LocalCoreProcessState:
    process: subprocess.Popen[str]
    handshake: LocalCoreVersionHandshake


class LocalCoreCommandError(RuntimeError):
    def __init__(
        self,
        message: str,
        *,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details = details or {}


class LocalCoreClient:
    def __init__(self) -> None:
        self._state: _LocalCoreProcessState | None = None
        self._lock = asyncio.Lock()

    async def render_realtime_dependency_values(
        self,
        request: LocalCoreRenderRealtimeDependencyValuesRequest,
    ) -> LocalCoreRenderRealtimeDependencyValuesResult:
        raw_result = await self.run_command(
            LOCAL_CORE_COMMAND_RENDER_REALTIME_DEPENDENCY_VALUES,
            request.model_dump(mode="json"),
        )
        return LocalCoreRenderRealtimeDependencyValuesResult.model_validate(raw_result)

    async def run_command(
        self,
        command_name: str,
        payload: dict[str, Any] | None = None,
    ) -> Any:
        async with self._lock:
            state = await asyncio.to_thread(self._ensure_started)
            envelope = LocalCoreCommandEnvelope(
                callId=uuid4().hex,
                commandName=command_name,
                payload=payload or {},
            )
            raw_result = await asyncio.to_thread(
                self._send_command_locked,
                state,
                envelope,
            )
        return raw_result

    def close(self) -> None:
        state = self._state
        self._state = None
        if state is None:
            return
        self._terminate_process(state.process)

    def __del__(self) -> None:
        self.close()

    def _ensure_started(self) -> _LocalCoreProcessState:
        state = self._state
        if state is not None and state.process.poll() is None:
            return state
        self.close()
        command, command_cwd = resolve_go_cli_command()
        env = {**os.environ, **resolve_go_cli_env(command_cwd)}
        process = subprocess.Popen(
            [*command, "sdk-local-core"],
            cwd=command_cwd,
            env=env,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        try:
            handshake_line = self._read_line(process)
            handshake = LocalCoreVersionHandshake.model_validate_json(handshake_line)
            self._verify_handshake(handshake)
        except Exception:
            self._terminate_process(process)
            raise
        state = _LocalCoreProcessState(
            process=process,
            handshake=handshake,
        )
        self._state = state
        return state

    def _send_command_locked(
        self,
        state: _LocalCoreProcessState,
        envelope: LocalCoreCommandEnvelope,
    ) -> Any:
        process = state.process
        if process.stdin is None:
            raise RuntimeError("Setta local core stdin is unavailable")
        process.stdin.write(envelope.model_dump_json())
        process.stdin.write("\n")
        process.stdin.flush()
        result_line = self._read_line(process)
        result = LocalCoreResultEnvelope.model_validate_json(result_line)
        if not result.ok:
            details = result.details or {}
            raw_code = details.get("code")
            code = (
                raw_code.strip()
                if isinstance(raw_code, str) and raw_code.strip()
                else None
            )
            raise LocalCoreCommandError(
                result.error or "Setta local core command failed",
                code=code,
                details=details,
            )
        return result.result

    def _read_line(self, process: subprocess.Popen[str]) -> str:
        if process.stdout is None:
            raise RuntimeError("Setta local core stdout is unavailable")
        line = process.stdout.readline()
        if line:
            return line
        self._raise_closed_stdout(process, self._read_stderr(process))

    def _read_stderr(self, process: subprocess.Popen[str]) -> str:
        if process.stderr is None:
            return ""
        return process.stderr.read().strip()

    def _raise_closed_stdout(
        self,
        process: subprocess.Popen[str],
        stderr_text: str,
    ) -> None:
        returncode = process.poll()
        if returncode is None:
            raise RuntimeError("Setta local core closed stdout unexpectedly")
        if stderr_text:
            raise RuntimeError(
                f"Setta local core exited before responding: {stderr_text}"
            )
        raise RuntimeError(
            f"Setta local core exited before responding (exit code {returncode})"
        )

    def _verify_handshake(self, handshake: LocalCoreVersionHandshake) -> None:
        expected_sdk_version = __version__.strip()
        if handshake.protocolVersion != LOCAL_CORE_PROTOCOL_VERSION:
            raise RuntimeCompatibilityError(
                "Setta local core protocol mismatch: "
                f"python={LOCAL_CORE_PROTOCOL_VERSION} "
                f"local_core={handshake.protocolVersion}"
            )
        if handshake.sdkVersion != expected_sdk_version:
            raise RuntimeCompatibilityError(
                "Setta SDK/local core version mismatch: "
                f"python={expected_sdk_version} local_core={handshake.sdkVersion} "
                f"(core={handshake.coreVersion})"
            )
        if handshake.sdkContractVersion != SETTA_SDK_CONTRACT_VERSION:
            raise RuntimeCompatibilityError(
                "Setta local core contract mismatch: "
                f"python={SETTA_SDK_CONTRACT_VERSION} "
                f"local_core={handshake.sdkContractVersion} "
                f"(sdk={handshake.sdkVersion} core={handshake.coreVersion})"
            )

    def _terminate_process(self, process: subprocess.Popen[str]) -> None:
        self._close_pipe(process.stdin)
        if process.poll() is None:
            self._stop_running_process(process)
        self._close_pipe(process.stdout)
        self._close_pipe(process.stderr)

    def _stop_running_process(self, process: subprocess.Popen[str]) -> None:
        process.terminate()
        try:
            process.wait(timeout=1)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=1)

    def _close_pipe(self, pipe: Any | None) -> None:
        if pipe is None:
            return
        pipe.close()
