import asyncio
import json
import os
import subprocess
from dataclasses import dataclass
from typing import Any
from uuid import uuid4

from setta import __version__
from setta.entrypoint import resolve_go_cli_command, resolve_go_cli_env
from setta.runtime_compat import RuntimeCompatibilityError
from setta.sdk_contracts.constants import SETTA_SDK_CONTRACT_VERSION
from setta.types.generated.go_shared_constants import (
    LOCAL_CORE_PROTOCOL_VERSION,
)


@dataclass(slots=True)
class _LocalCoreProcessState:
    process: subprocess.Popen[str]
    handshake: dict[str, Any]


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

    async def run_command(
        self,
        command_name: str,
        payload: dict[str, Any] | None = None,
    ) -> Any:
        async with self._lock:
            state = await asyncio.to_thread(self._ensure_started)
            raw_result = await asyncio.to_thread(
                self._send_command_locked,
                state,
                {
                    "callId": uuid4().hex,
                    "commandName": command_name,
                    "payload": payload or {},
                },
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
            handshake = self._parse_json_line(handshake_line)
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
        envelope: Any,
    ) -> Any:
        process = state.process
        if process.stdin is None:
            raise RuntimeError("Setta local core stdin is unavailable")
        process.stdin.write(self._dump_json(envelope))
        process.stdin.write("\n")
        process.stdin.flush()
        result_line = self._read_line(process)
        result = self._parse_json_line(result_line)
        if not result.get("ok"):
            details = result.get("details")
            if not isinstance(details, dict):
                details = {}
            raw_code = details.get("code")
            code = (
                raw_code.strip()
                if isinstance(raw_code, str) and raw_code.strip()
                else None
            )
            raise LocalCoreCommandError(
                result.get("error") or "Setta local core command failed",
                code=code,
                details=details,
            )
        return result.get("result")

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

    def _parse_json_line(self, line: str) -> dict[str, Any]:
        payload = json.loads(line)
        if not isinstance(payload, dict):
            raise RuntimeError("Setta local core returned a non-object payload")
        return payload

    def _dump_json(self, payload: Any) -> str:
        model_dump_json = getattr(payload, "model_dump_json", None)
        if callable(model_dump_json):
            return model_dump_json()
        return json.dumps(payload, separators=(",", ":"))

    def _verify_handshake(self, handshake: dict[str, Any]) -> None:
        expected_sdk_version = __version__.strip()
        protocol_version = handshake.get("protocolVersion")
        sdk_version = handshake.get("sdkVersion")
        sdk_contract_version = handshake.get("sdkContractVersion")
        core_version = handshake.get("coreVersion")
        if protocol_version != LOCAL_CORE_PROTOCOL_VERSION:
            raise RuntimeCompatibilityError(
                "Setta local core protocol mismatch: "
                f"python={LOCAL_CORE_PROTOCOL_VERSION} "
                f"local_core={protocol_version}"
            )
        if sdk_version != expected_sdk_version:
            raise RuntimeCompatibilityError(
                "Setta SDK/local core version mismatch: "
                f"python={expected_sdk_version} local_core={sdk_version} "
                f"(core={core_version})"
            )
        if sdk_contract_version != SETTA_SDK_CONTRACT_VERSION:
            raise RuntimeCompatibilityError(
                "Setta local core contract mismatch: "
                f"python={SETTA_SDK_CONTRACT_VERSION} "
                f"local_core={sdk_contract_version} "
                f"(sdk={sdk_version} core={core_version})"
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


def run_local_core_command_once(
    command_name: str,
    payload: dict[str, Any] | None = None,
) -> Any:
    client = LocalCoreClient()
    try:
        state = client._ensure_started()
        return client._send_command_locked(
            state,
            {
                "callId": uuid4().hex,
                "commandName": command_name,
                "payload": payload or {},
            },
        )
    finally:
        client.close()
