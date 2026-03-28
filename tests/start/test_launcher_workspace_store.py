import json
import threading
import time
from pathlib import Path

import pytest

import setta.launcher_workspace_store as launcher_workspace_store
from setta.launcher_workspace_store import (
    LauncherWorkspaceEntry,
    LauncherWorkspaceStoreError,
    load_recent_workspaces,
    resolve_recent_workspaces_path,
    upsert_recent_workspace,
)


def test_recent_workspace_updates_are_atomic_under_concurrency(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Two concurrent upserts must not lose either workspace entry.
    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(tmp_path))
    setta_home = (tmp_path / "setta-home").resolve(strict=False)
    workspace_a = (tmp_path / "workspace-a").resolve(strict=False)
    workspace_b = (tmp_path / "workspace-b").resolve(strict=False)
    original_write = launcher_workspace_store._write_recent_workspaces_atomic
    first_write_started = threading.Event()

    def delayed_atomic_write(
        *, path: Path, entries: list[LauncherWorkspaceEntry]
    ) -> None:
        if not first_write_started.is_set():
            first_write_started.set()
            time.sleep(0.1)
        original_write(path=path, entries=entries)

    monkeypatch.setattr(
        "setta.launcher_workspace_store._write_recent_workspaces_atomic",
        delayed_atomic_write,
    )

    barrier = threading.Barrier(3)
    errors: list[BaseException] = []

    def run_upsert(workspace_root: Path) -> None:
        try:
            barrier.wait(timeout=2)
            upsert_recent_workspace(
                setta_home=setta_home, workspace_root=workspace_root
            )
        except BaseException as exc:  # pragma: no cover - assertion path
            errors.append(exc)

    first_thread = threading.Thread(target=run_upsert, args=(workspace_a,))
    second_thread = threading.Thread(target=run_upsert, args=(workspace_b,))
    first_thread.start()
    second_thread.start()
    barrier.wait(timeout=2)
    first_thread.join(timeout=5)
    second_thread.join(timeout=5)

    assert not errors
    assert not first_thread.is_alive()
    assert not second_thread.is_alive()

    entries = load_recent_workspaces(setta_home=setta_home)
    workspace_roots = {str(entry.workspace_root) for entry in entries}
    assert workspace_roots == {str(workspace_a), str(workspace_b)}


def test_atomic_write_preserves_previous_json_on_replace_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # A failed replace must keep the existing recent-workspaces file valid.
    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(tmp_path))
    setta_home = (tmp_path / "setta-home").resolve(strict=False)
    existing_workspace = (tmp_path / "workspace-existing").resolve(strict=False)
    replacement_workspace = (tmp_path / "workspace-replacement").resolve(strict=False)

    upsert_recent_workspace(
        setta_home=setta_home,
        workspace_root=existing_workspace,
        pinned=False,
        last_used_at=111,
    )

    def fail_replace(_src: Path, _dst: Path) -> None:
        raise OSError("simulated replace failure")

    monkeypatch.setattr("setta.launcher_workspace_store.os.replace", fail_replace)

    with pytest.raises(LauncherWorkspaceStoreError) as excinfo:
        upsert_recent_workspace(
            setta_home=setta_home,
            workspace_root=replacement_workspace,
            pinned=True,
            last_used_at=222,
        )

    assert "Failed writing launcher recent-workspaces file" in str(excinfo.value)

    entries_after_failure = load_recent_workspaces(setta_home=setta_home)
    assert len(entries_after_failure) == 1
    assert entries_after_failure[0].workspace_root == existing_workspace
    assert entries_after_failure[0].pinned is False
    assert entries_after_failure[0].last_used_at == 111

    persisted_path = resolve_recent_workspaces_path(setta_home=setta_home)
    persisted_payload = json.loads(persisted_path.read_text(encoding="utf-8"))
    assert isinstance(persisted_payload, list)
    assert persisted_payload[0]["workspaceRoot"] == str(existing_workspace)


def test_load_recent_workspaces_prunes_entries_outside_allowed_roots(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    setta_home = (tmp_path / "setta-home").resolve(strict=False)
    monkeypatch.setenv("SETTA_LAUNCHER_ALLOWED_ROOTS", str(tmp_path / "allowed"))
    allowed_workspace = (tmp_path / "allowed" / "workspace-a").resolve(strict=False)
    blocked_workspace = (tmp_path / "blocked" / "workspace-b").resolve(strict=False)
    allowed_workspace.mkdir(parents=True, exist_ok=True)
    blocked_workspace.mkdir(parents=True, exist_ok=True)

    recent_path = resolve_recent_workspaces_path(setta_home=setta_home)
    recent_path.parent.mkdir(parents=True, exist_ok=True)
    recent_path.write_text(
        json.dumps(
            [
                {
                    "workspaceRoot": str(allowed_workspace),
                    "pinned": True,
                    "lastUsedAt": 3,
                },
                {
                    "workspaceRoot": str(blocked_workspace),
                    "pinned": False,
                    "lastUsedAt": 2,
                },
            ],
            indent=2,
            sort_keys=True,
        ),
        encoding="utf-8",
    )

    entries = load_recent_workspaces(setta_home=setta_home)

    assert [str(entry.workspace_root) for entry in entries] == [str(allowed_workspace)]
    persisted_payload = json.loads(recent_path.read_text(encoding="utf-8"))
    assert persisted_payload == [
        {
            "workspaceRoot": str(allowed_workspace),
            "pinned": True,
            "lastUsedAt": 3,
        }
    ]
