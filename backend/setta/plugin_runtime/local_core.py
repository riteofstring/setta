import json
import os
import subprocess
from typing import Any
from uuid import uuid4

from setta.entrypoint import resolve_go_cli_command, resolve_go_cli_env
from setta.types.generated.go_shared_constants import LOCAL_CORE_PROTOCOL_VERSION


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


def run_local_core_command(
    command_name: str,
    payload: dict[str, Any] | None = None,
) -> Any:
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
        handshake = json.loads(_read_local_core_line(process))
        protocol_version = handshake.get("protocolVersion")
        if protocol_version != LOCAL_CORE_PROTOCOL_VERSION:
            raise RuntimeError(
                "Setta local core protocol mismatch: "
                f"plugin={LOCAL_CORE_PROTOCOL_VERSION} local_core={protocol_version}"
            )

        if process.stdin is None:
            raise RuntimeError("Setta local core stdin is unavailable")
        json.dump(
            {
                "callId": uuid4().hex,
                "commandName": command_name,
                "payload": payload or {},
            },
            process.stdin,
        )
        process.stdin.write("\n")
        process.stdin.flush()

        result = json.loads(_read_local_core_line(process))
        if result.get("ok"):
            return result.get("result")

        details = result.get("details")
        if not isinstance(details, dict):
            details = {}
        raw_code = details.get("code")
        code = (
            raw_code.strip() if isinstance(raw_code, str) and raw_code.strip() else None
        )
        raise LocalCoreCommandError(
            str(result.get("error") or "Setta local core command failed"),
            code=code,
            details=details,
        )
    finally:
        _terminate_local_core_process(process)


def _read_local_core_line(process: subprocess.Popen[str]) -> str:
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
        raise RuntimeError(f"Setta local core exited before responding: {stderr_text}")
    raise RuntimeError(
        f"Setta local core exited before responding (exit code {returncode})"
    )


def _terminate_local_core_process(process: subprocess.Popen[str]) -> None:
    for pipe in (process.stdin, process.stdout, process.stderr):
        if pipe is not None:
            pipe.close()
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=1)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=1)
