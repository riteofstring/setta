import pytest
from fastapi import FastAPI

import setta.server as server_module


@pytest.mark.asyncio
async def test_lifespan_continues_cleanup_when_plugin_shutdown_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Lifespan teardown should continue watcher/MCP/LSP cleanup when plugin shutdown raises.
    state_ref: dict[str, object] = {}
    stop_lsps_calls: list[tuple[list[str], list[str]]] = []
    stop_watcher_calls: list[list[str]] = []
    logged_exceptions: list[str] = []

    class _FakePluginManager:
        def shutdown_backend_plugins(self) -> None:
            raise RuntimeError("plugin shutdown failed")

    class _FakeWatcher:
        def __init__(self) -> None:
            self.stop_calls = 0

        def stop(self) -> None:
            self.stop_calls += 1

    class _FakeMcpClient:
        def __init__(self) -> None:
            self.disabled = False
            self.stop_calls = 0

        async def stop(self) -> None:
            self.stop_calls += 1

    class _FakeSettaState:
        def __init__(self, _app: FastAPI, **_kwargs) -> None:
            self.plugin_manager = _FakePluginManager()
            self.specific_file_watcher = _FakeWatcher()
            self.mcp_client = _FakeMcpClient()
            self.lsps = ["lsp-server"]
            self.lsp_readers = ["lsp-reader"]
            self.lsp_writers = ["lsp-writer"]
            state_ref["value"] = self

    async def _record_stop_lsps(lsps: list[str], readers: list[str]) -> None:
        stop_lsps_calls.append((lsps, readers))

    def _record_stop_file_watcher(writers: list[str]) -> None:
        stop_watcher_calls.append(writers)

    monkeypatch.setattr(server_module, "SettaFastAPIState", _FakeSettaState)
    monkeypatch.setattr(server_module, "IS_DEV_MODE", True)
    monkeypatch.setattr(server_module.C, "SHARE_MODE", False, raising=False)
    monkeypatch.setattr(server_module.C, "APP_MODE", False, raising=False)
    monkeypatch.setattr(server_module.C, "OPEN_BROWSER_ON_START", None, raising=False)
    monkeypatch.setattr(server_module, "stop_lsps", _record_stop_lsps)
    monkeypatch.setattr(server_module, "stop_file_watcher", _record_stop_file_watcher)
    monkeypatch.setattr(
        server_module.logger,
        "exception",
        lambda message: logged_exceptions.append(message),
    )

    app = FastAPI()
    async with server_module.lifespan(app):
        assert app.state.setta is not None

    fake_state = state_ref.get("value")
    assert fake_state is not None
    assert isinstance(fake_state, _FakeSettaState)
    assert fake_state.specific_file_watcher.stop_calls == 1
    assert fake_state.mcp_client.stop_calls == 1
    assert stop_lsps_calls == [(["lsp-server"], ["lsp-reader"])]
    assert stop_watcher_calls == [["lsp-writer"]]
    assert logged_exceptions == [
        "Plugin manager shutdown failed during lifespan teardown."
    ]
