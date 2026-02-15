import shutil
from pathlib import Path

import pytest
from fastapi import FastAPI

import setta.server_state as server_state_module
from setta.server_state import SettaFastAPIState
from setta.types.section_impls import CodeLanguage
from tests.utils.setta_paths import temporary_setta_paths

FIXTURE_PLUGIN_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "plugins"


@pytest.mark.asyncio
async def test_ide_state_registers_plugin_language_servers_before_lsp_writers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Plugin language servers should be present in LSP writers immediately after startup.
    workspace_root = tmp_path / "workspace"
    setta_home = tmp_path / ".setta"
    workspace_root.mkdir(parents=True, exist_ok=True)
    setta_home.mkdir(parents=True, exist_ok=True)

    plugin_id = "setta-fixture-backend-language-server"
    plugin_destination = workspace_root / ".setta_plugins" / plugin_id
    plugin_destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(FIXTURE_PLUGIN_ROOT / "backend-language-server", plugin_destination)

    async def _noop_start_lsps(_lsps, _lsp_readers, _lsp_writers) -> None:
        return None

    monkeypatch.setattr(server_state_module, "start_lsps", _noop_start_lsps)

    with temporary_setta_paths(
        workspace_root=workspace_root,
        setta_files_location="local",
        setta_home=setta_home,
    ):
        app = FastAPI()
        state = SettaFastAPIState(
            app,
            enable_mcp_connections=False,
        )
        await state.wait_until_ready()

        assert state.lsp_writers is not None
        assert state.lsp_writers.get_for_language(CodeLanguage.typescript) is not None
