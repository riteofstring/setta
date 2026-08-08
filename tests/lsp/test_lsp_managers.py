from pathlib import Path
import sys

import pytest

from setta.lsp.managers import (
    BASEDPYRIGHT_LANGSERVER_ENTRYPOINT,
    LSPServers,
    LSPWriters,
)
from setta.lsp.registrations import RegisteredLanguageServer
from setta.lsp.server import LanguageServer
from setta.types.section_impls import CodeLanguage


def test_lsp_servers_include_plugin_language_servers(tmp_path: Path) -> None:
    # Plugin registrations should produce deterministic per-language server instances.
    settings = {
        "basedpyright": {"analysis": {"typeCheckingMode": "basic"}},
        "typescriptLanguageServer": {"preferences": {"quoteStyle": "single"}},
    }
    registration = RegisteredLanguageServer(
        plugin_id="plugin.typescript",
        name="plugin.typescript:fixturedsl",
        language="fixturedsl",
        command="typescript-language-server",
        args=("--stdio",),
        settings_key="typescriptLanguageServer",
    )

    servers = LSPServers(
        settings,
        workspace_root=tmp_path,
        plugin_language_servers=[registration],
    )

    assert servers.by_language[CodeLanguage.python] is servers.full
    assert servers.full.command == sys.executable
    assert servers.full.args == (
        "-c",
        BASEDPYRIGHT_LANGSERVER_ENTRYPOINT,
        "--stdio",
    )
    fixture_server = servers.by_language["fixturedsl"]
    assert fixture_server.language == "fixturedsl"
    assert fixture_server.command == "typescript-language-server"
    assert fixture_server.args == ("--stdio",)
    assert fixture_server.settings == {
        "typescriptLanguageServer": {"preferences": {"quoteStyle": "single"}}
    }


def test_lsp_servers_reject_duplicate_plugin_language_registrations(
    tmp_path: Path,
) -> None:
    # Multiple plugin registrations for the same language should fail fast.
    registration_a = RegisteredLanguageServer(
        plugin_id="plugin.one",
        name="plugin.one:fixturedsl",
        language="fixturedsl",
        command="typescript-language-server",
        args=("--stdio",),
        settings_key="typescriptLanguageServer",
    )
    registration_b = RegisteredLanguageServer(
        plugin_id="plugin.two",
        name="plugin.two:fixturedsl",
        language="fixturedsl",
        command="my-ts-server",
        args=("--stdio",),
        settings_key="typescriptLanguageServer",
    )

    with pytest.raises(ValueError, match="Duplicate language server registration"):
        LSPServers(
            {},
            workspace_root=tmp_path,
            plugin_language_servers=[registration_a, registration_b],
        )


def test_lsp_writers_expose_language_specific_writers(tmp_path: Path) -> None:
    # Writer lookup should expose python + plugin-language writers and omit unregistered languages.
    registration = RegisteredLanguageServer(
        plugin_id="plugin.typescript",
        name="plugin.typescript:fixturedsl",
        language="fixturedsl",
        command="typescript-language-server",
        args=("--stdio",),
        settings_key=None,
    )
    servers = LSPServers(
        {},
        workspace_root=tmp_path,
        plugin_language_servers=[registration],
    )

    writers = LSPWriters(servers)

    assert writers.get_for_language(CodeLanguage.python) is writers.full
    assert writers.get_for_language("fixturedsl") is not None
    assert writers.get_for_language(CodeLanguage.json) is None


@pytest.mark.asyncio
async def test_lsp_servers_start_rolls_back_started_servers_on_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    # Startup should terminate already-started servers if a later server fails.
    registration = RegisteredLanguageServer(
        plugin_id="plugin.typescript",
        name="plugin.typescript:fixturedsl",
        language="fixturedsl",
        command="missing-language-server",
        args=("--stdio",),
        settings_key=None,
    )
    servers = LSPServers(
        {},
        workspace_root=tmp_path,
        plugin_language_servers=[registration],
    )

    class _FakeReader:
        async def read(self) -> bytes:
            return b""

    class _FakeWriter:
        def close(self) -> None:
            return None

        async def wait_closed(self) -> None:
            return None

    class _FakeProcess:
        def __init__(self) -> None:
            self.stdin = _FakeWriter()
            self.stdout = _FakeReader()
            self.stderr = _FakeReader()
            self.returncode = None

        async def wait(self) -> int:
            self.returncode = 0
            return 0

        def kill(self) -> None:
            self.returncode = -9

        def terminate(self) -> None:
            self.returncode = 0

    started_server_names: list[str] = []
    stopped_server_names: list[str] = []

    async def _start_with_failure(server: LanguageServer) -> None:
        started_server_names.append(server.name)
        if server.name == "full":
            server.server = _FakeProcess()
            return
        raise FileNotFoundError(server.command)

    def _stop(server: LanguageServer) -> None:
        stopped_server_names.append(server.name)
        process = getattr(server, "server", None)
        if process is not None and hasattr(process, "terminate"):
            process.terminate()
        server.server = None

    monkeypatch.setattr(LanguageServer, "start", _start_with_failure)
    monkeypatch.setattr(LanguageServer, "stop", _stop)

    with pytest.raises(FileNotFoundError):
        await servers.start()

    assert started_server_names == ["full", "plugin.typescript:fixturedsl"]
    assert stopped_server_names == ["full"]
