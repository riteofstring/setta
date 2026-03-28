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


class LocalCoreClient:
    def __init__(self) -> None:
        self._state: _LocalCoreProcessState | None = None
        self._lock = asyncio.Lock()

    async def render_realtime_dependency_values(
        self,
        request: LocalCoreRenderRealtimeDependencyValuesRequest,
    ) -> LocalCoreRenderRealtimeDependencyValuesResult:
        async with self._lock:
            state = await asyncio.to_thread(self._ensure_started)
            envelope = LocalCoreCommandEnvelope(
                callId=uuid4().hex,
                commandName=LOCAL_CORE_COMMAND_RENDER_REALTIME_DEPENDENCY_VALUES,
                payload=request.model_dump(mode="json"),
            )
            raw_result = await asyncio.to_thread(
                self._send_command_locked,
                state,
                envelope,
            )
        return LocalCoreRenderRealtimeDependencyValuesResult.model_validate(raw_result)

    def close(self) -> None:
        state = self._state
        if state is None:
            return
        self._state = None
        process = state.process
        if process.stdin is not None:
            process.stdin.close()
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=1)
        if process.stdout is not None:
            process.stdout.close()
        if process.stderr is not None:
            process.stderr.close()

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
            raise RuntimeError(result.error or "Setta local core command failed")
        return result.result

    def _read_line(self, process: subprocess.Popen[str]) -> str:
        if process.stdout is None:
            raise RuntimeError("Setta local core stdout is unavailable")
        line = process.stdout.readline()
        if line:
            return line
        stderr_text = ""
        if process.stderr is not None:
            stderr_text = process.stderr.read().strip()
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
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=1)
        if process.stdin is not None:
            process.stdin.close()
        if process.stdout is not None:
            process.stdout.close()
        if process.stderr is not None:
            process.stderr.close()
