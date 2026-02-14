from pathlib import Path

import pytest

from setta.lsp.managers import LSPServers, LSPWriters
from setta.lsp.registrations import RegisteredLanguageServer
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
