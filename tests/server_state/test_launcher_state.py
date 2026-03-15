from pathlib import Path

import pytest
from fastapi import FastAPI

from setta.server_state import SettaFastAPIState
from tests.utils.setta_paths import temporary_setta_paths


@pytest.mark.asyncio
async def test_launcher_state_skips_ide_initialization_phases(
    tmp_path: Path,
) -> None:
    workspace_root = tmp_path / "workspace"
    setta_home = tmp_path / ".setta"
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location="local",
        setta_home=setta_home,
    ):
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            launcher_mode=True,
            enable_mcp_connections=False,
        )
        await state.wait_until_ready()

    status = state.init_status.snapshot()
    messages = [event.message for event in status.events]
    assert status.isReady is True
    assert "Preparing launcher runtime" in messages
    assert "Launcher backend ready" in messages
    assert "Loading project state" not in messages
    assert "Loading backend plugins" not in messages
    assert "Booting MCP and chat managers" not in messages
    assert "Starting language servers" not in messages
    assert not state.project_manager_switcher
    assert state.mcp_client.disabled
