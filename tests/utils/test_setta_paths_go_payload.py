import json
import os
import subprocess
from pathlib import Path

import pytest
import setta.utils.paths as paths_module
from setta.entrypoint import resolve_go_cli_command, resolve_go_cli_env
from tests.helpers.setta_paths import clear_setta_paths_cache


@pytest.fixture(autouse=True)
def _setta_env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("SETTA_WORKSPACE_ROOT", raising=False)
    monkeypatch.delenv("SETTA_PROFILE_LOOKUP_HOME", raising=False)
    monkeypatch.delenv("SETTA_PROFILE", raising=False)
    monkeypatch.delenv("SETTA_FILES_ROOT", raising=False)
    monkeypatch.delenv("SETTA_FILES_LOCATION", raising=False)
    monkeypatch.delenv("SETTA_RUNTIME_ROOT", raising=False)
    monkeypatch.setenv("SETTA_HOME", str(tmp_path / ".setta"))
    clear_setta_paths_cache()


def authoritative_go_paths_payload(
    *,
    workspace_root: Path | None = None,
    setta_files_location: str | None = None,
    cwd: Path | None = None,
) -> dict[str, object]:
    command, command_cwd = resolve_go_cli_command()
    args = [*command]
    if workspace_root is not None:
        args.extend(["--workspace", str(workspace_root)])
    if setta_files_location is not None:
        args.extend(["--setta-files-location", setta_files_location])
    args.extend(
        ["paths", "--json", "--cwd", str((cwd or Path.cwd()).resolve(strict=False))]
    )
    completed = subprocess.run(
        args,
        check=False,
        cwd=command_cwd,
        env={**os.environ, **resolve_go_cli_env(command_cwd)},
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        pytest.fail(
            "authoritative Go paths command failed: "
            f"{completed.stderr.strip() or completed.stdout.strip()}"
        )
    payload = json.loads(completed.stdout)
    if not isinstance(payload, dict):
        pytest.fail(f"authoritative Go paths payload had invalid shape: {payload!r}")
    return payload


def authoritative_go_setta_files_root(
    *,
    workspace_root: Path,
    setta_files_location: str | None = None,
    cwd: Path | None = None,
) -> Path:
    payload = authoritative_go_paths_payload(
        workspace_root=workspace_root,
        setta_files_location=setta_files_location,
        cwd=cwd,
    )
    value = payload.get("settaFilesRoot")
    if not isinstance(value, str) or not value.strip():
        pytest.fail(
            f"authoritative Go paths payload missing settaFilesRoot: {payload!r}"
        )
    return Path(value).resolve(strict=False)


def test_resolve_go_paths_payload_rejects_non_object_json(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        paths_module,
        "resolve_go_cli_command",
        lambda: (["setta"], None),
    )
    monkeypatch.setattr(paths_module, "resolve_go_cli_env", lambda _cwd: {})
    monkeypatch.setattr(
        paths_module.subprocess,
        "run",
        lambda *_args, **_kwargs: subprocess.CompletedProcess(
            args=_args[0],
            returncode=0,
            stdout="[]",
            stderr="",
        ),
    )

    with pytest.raises(ValueError, match="invalid payload shape"):
        paths_module._resolve_go_paths_payload(
            workspace_root=None,
            setta_home=None,
            profile_lookup_home=None,
            setta_files_location=None,
            setta_files_root=None,
            runtime_root=None,
            profile=None,
            allow_env_files_overrides=True,
            allow_env_non_files_overrides=True,
            allow_profile_env_overrides=True,
        )


def test_resolve_go_paths_payload_wraps_subprocess_oserror(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        paths_module,
        "resolve_go_cli_command",
        lambda: (["setta"], None),
    )
    monkeypatch.setattr(paths_module, "resolve_go_cli_env", lambda _cwd: {})

    def _raise_oserror(
        *_args: object, **_kwargs: object
    ) -> subprocess.CompletedProcess[str]:
        raise OSError("boom")

    monkeypatch.setattr(paths_module.subprocess, "run", _raise_oserror)

    with pytest.raises(
        ValueError, match="Failed to execute Go Setta paths command: boom"
    ):
        paths_module._resolve_go_paths_payload(
            workspace_root=None,
            setta_home=None,
            profile_lookup_home=None,
            setta_files_location=None,
            setta_files_root=None,
            runtime_root=None,
            profile=None,
            allow_env_files_overrides=True,
            allow_env_non_files_overrides=True,
            allow_profile_env_overrides=True,
        )
