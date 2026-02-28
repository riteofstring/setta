import tempfile
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError
import pytest
import setta.mcp.codex_config as codex_config_module
from setta.database.db_objs import DBE
from setta.llm.config import load_llm_config, merge_chat_llm_configs, save_llm_config
from setta.llm.example_config import seed_llm_config_example_file
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.chat import ChatMetadata
from setta.types.id import ID
from setta.types.llm_config import (
    SCRIPTABLE_LLM_CONFIG_ID,
    AllLLMConfigs,
    LLMConfig,
    MCPServerConfig,
)
from setta.utils import constants as constants_module

DEFAULT_PROJECT_CONFIG_ID = ID("llm-config-tests-project")


def _build_chat_metadata(
    name: str, llm_config: LLMConfig, project_config_id: ID = DEFAULT_PROJECT_CONFIG_ID
) -> ChatMetadata:
    return ChatMetadata(
        id=f"chat-{name}",
        name=name,
        lastUpdated=datetime.now(),
        llmConfig=llm_config,
        projectConfigId=project_config_id,
    )


class TestMergeChatLLMConfigs:
    def test_skips_configs_already_in_persisted_set(self) -> None:
        base_config = LLMConfig(
            id="primary",
            model="gpt-5.1",
            provider="openai",
            base_url="https://api.openai.com/v1",
            other_params={"timeout": 12},
        )
        all_configs = AllLLMConfigs(configs={"primary": base_config})
        metadata = [
            _build_chat_metadata(
                f"chat-{idx}",
                base_config.model_copy(deep=True),
            )
            for idx in range(3)
        ]

        merged = merge_chat_llm_configs(all_configs, metadata)

        assert set(merged.configs.keys()) == {"primary"}
        assert not merged.configs["primary"].temporary

    def test_collapses_duplicate_chat_configs(self) -> None:
        chat_config = LLMConfig(
            id="primary",
            model="gpt-5.1",
            provider="openai",
        )
        metadata = [
            _build_chat_metadata("chat-a", chat_config.model_copy(deep=True)),
            _build_chat_metadata("chat-b", chat_config.model_copy(deep=True)),
        ]

        merged = merge_chat_llm_configs(AllLLMConfigs(), metadata)

        assert len(merged.configs) == 1
        merged_config = next(iter(merged.configs.values()))
        assert merged_config.temporary
        assert merged_config.model == "gpt-5.1"

    def test_preserves_distinct_chat_configs(self) -> None:
        persisted = AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="gpt-5.1",
                    provider="openai",
                )
            }
        )
        chat_metadata = [
            _build_chat_metadata(
                "chat-old",
                LLMConfig(
                    id="primary",
                    model="claude-3",
                    provider="anthropic",
                ),
            )
        ]

        merged = merge_chat_llm_configs(persisted, chat_metadata)

        assert len(merged.configs) == 2
        temporary_configs = [cfg for cfg in merged.configs.values() if cfg.temporary]
        assert len(temporary_configs) == 1
        assert temporary_configs[0].model == "claude-3"


class TestAllLLMConfigsValidation:
    def test_infers_id_from_config_key(self) -> None:
        config = AllLLMConfigs.model_validate(
            {
                "configs": {
                    "primary": {
                        "model": "gpt-5.1",
                        "provider": "openai",
                    }
                },
                "default_config_id": "primary",
            }
        )

        assert config.configs["primary"].id == "primary"

    def test_rejects_inline_id_field(self) -> None:
        with pytest.raises(ValidationError):
            AllLLMConfigs.model_validate(
                {
                    "configs": {
                        "primary": {
                            "id": "primary",
                            "model": "gpt-5.1",
                        }
                    }
                }
            )


class TestListenerConfigResolution:
    def test_resolves_scriptable_id(self) -> None:
        configs = AllLLMConfigs()
        resolved = configs.resolve_listener_config(SCRIPTABLE_LLM_CONFIG_ID)

        assert resolved.id == SCRIPTABLE_LLM_CONFIG_ID
        assert resolved.model == SCRIPTABLE_LLM_CONFIG_ID
        assert resolved.mcpServerIds == []
        assert resolved.temporary
        assert resolved.provider is None

    def test_rejects_empty_listener_id(self) -> None:
        configs = AllLLMConfigs()
        with pytest.raises(ValueError):
            configs.resolve_listener_config("")

    def test_rejects_unknown_listener_id(self) -> None:
        configs = AllLLMConfigs()
        with pytest.raises(ValueError):
            configs.resolve_listener_config("missing-config")

    def test_resolves_real_config(self) -> None:
        config = LLMConfig(id="primary", model="gpt-5.1")
        configs = AllLLMConfigs(configs={"primary": config})
        resolved = configs.resolve_listener_config("primary")

        assert resolved.id == "primary"
        assert resolved.model == "gpt-5.1"


class TestMcpServerSelection:
    def _build_mcp_servers(self) -> dict[str, MCPServerConfig]:
        return {
            SETTA_MCP_SERVER_ID: MCPServerConfig(
                transport="sse",
                url="http://localhost:8000/mcp",
            ),
            "github": MCPServerConfig(
                transport="streamable_http",
                url="http://localhost:9000/mcp",
            ),
        }

    def test_resolves_all_mcp_servers_when_defaults_unset(self) -> None:
        mcp_servers = self._build_mcp_servers()
        configs = AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="gpt-5.1",
                )
            },
            mcpServers=mcp_servers,
        )

        resolved = configs.resolve_mcp_server_ids(configs.configs["primary"])

        assert resolved == [SETTA_MCP_SERVER_ID, "github"]

    def test_resolves_default_mcp_server_ids(self) -> None:
        mcp_servers = self._build_mcp_servers()
        configs = AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="gpt-5.1",
                )
            },
            mcpServers=mcp_servers,
            defaultMcpServerIds=[SETTA_MCP_SERVER_ID],
        )

        resolved = configs.resolve_mcp_server_ids(configs.configs["primary"])

        assert resolved == [SETTA_MCP_SERVER_ID]

    def test_resolves_empty_mcp_server_ids(self) -> None:
        mcp_servers = self._build_mcp_servers()
        configs = AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="gpt-5.1",
                    mcpServerIds=[],
                )
            },
            mcpServers=mcp_servers,
            defaultMcpServerIds=[SETTA_MCP_SERVER_ID],
        )

        resolved = configs.resolve_mcp_server_ids(configs.configs["primary"])

        assert resolved == []


class TestLLMConfigPersistence:
    def test_save_llm_config_strips_ids_from_disk(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            config = AllLLMConfigs(
                configs={
                    "primary": LLMConfig(
                        id="primary",
                        model="gpt-5.1",
                        provider="openai",
                    )
                },
                default_config_id="primary",
            )

            save_llm_config(config, dbe)
            raw = dbe.read_llm_config()

            assert "id" not in raw["configs"]["primary"]

            loaded = load_llm_config(dbe)
            assert loaded.configs["primary"].id == "primary"

    def test_save_llm_config_can_write_example_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            config = AllLLMConfigs(
                configs={
                    "secondary": LLMConfig(
                        id="secondary",
                        model="gpt-4o",
                        provider="openai",
                    )
                }
            )

            save_llm_config(config, dbe, is_example=True)

            # Default llm_config.json should remain empty until explicitly saved.
            assert dbe.read_llm_config() == {}
            payload = dbe.read_llm_config_example()
            assert "secondary" in payload["configs"]

    def test_load_llm_config_uses_example_when_not_in_dev_mode(
        self, monkeypatch
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            seed_llm_config_example_file(dbe)

            # Built mode leaves SETTA_DEV_MODE unset; fallback should still use example data.
            monkeypatch.setattr(constants_module, "IS_DEV_MODE", None)

            loaded = load_llm_config(dbe)

            assert "claude-sonnet" in loaded.configs
            assert "openai-whisper-1" in loaded.configs
            persisted = dbe.read_llm_config()
            assert "claude-sonnet" in persisted.get("configs", {})
            assert "openai-whisper-1" in persisted.get("configs", {})

    def test_load_llm_config_uses_seeded_example_payload_in_same_call(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            dbe.write_llm_config({"configs": {}, "default_config_id": None})
            dbe.write_llm_config_example(
                {
                    "configs": {
                        "seeded": {
                            "model": "gpt-4.1-mini",
                            "provider": "openai",
                        }
                    },
                    "default_config_id": "seeded",
                }
            )

            loaded = load_llm_config(dbe)

            assert "seeded" in loaded.configs
            assert loaded.default_config_id == "seeded"

    def test_load_llm_config_uses_seeded_example_payload_when_allow_write_disabled(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            dbe.write_llm_config({"configs": {}, "default_config_id": None})
            dbe.write_llm_config_example(
                {
                    "configs": {
                        "seeded-no-write": {
                            "model": "gpt-4.1-mini",
                            "provider": "openai",
                        }
                    },
                }
            )

            loaded = load_llm_config(dbe, allow_write=False)

            assert "seeded-no-write" in loaded.configs
            assert dbe.read_llm_config() == {"configs": {}, "default_config_id": None}


class TestCodexMcpBootstrap:
    def test_load_llm_config_bootstraps_codex_mcp_servers_when_only_setta(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.figma-desktop]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.figma-desktop.http_headers]
Authorization = "Bearer figma-token"

[mcp_servers.pencil]
command = "/Applications/Pencil.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64"
args = ["--app", "desktop"]
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "figma-desktop" in loaded.mcpServers
            figma = loaded.mcpServers["figma-desktop"]
            assert figma.transport == "streamable_http"
            assert figma.url == "http://127.0.0.1:3845/mcp"
            assert figma.http_headers == {"Authorization": "Bearer figma-token"}

            assert "pencil" in loaded.mcpServers
            pencil = loaded.mcpServers["pencil"]
            assert pencil.transport == "stdio"
            assert (
                pencil.command
                == "/Applications/Pencil.app/Contents/Resources/app.asar.unpacked/out/mcp-server-darwin-arm64"
            )
            assert pencil.args == ["--app", "desktop"]
            assert loaded.codexMcpImportedAt is not None

            persisted = dbe.read_llm_config()
            persisted_mcp = persisted.get("mcpServers", {})
            assert "figma-desktop" in persisted_mcp
            assert "pencil" in persisted_mcp
            assert isinstance(persisted.get("codexMcpImportedAt"), str)

    def test_load_llm_config_does_not_override_existing_non_setta_servers(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.figma-desktop]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        ),
                        "workspace-tools": MCPServerConfig(
                            transport="streamable_http",
                            url="http://127.0.0.1:9000/mcp",
                        ),
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "workspace-tools" in loaded.mcpServers
            assert "figma-desktop" not in loaded.mcpServers
            assert loaded.codexMcpImportedAt is not None

    def test_load_llm_config_does_not_reimport_codex_servers_after_user_removal(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.figma-desktop]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))

            setta_server = MCPServerConfig(
                transport="sse",
                url="http://127.0.0.1:8000/mcp",
            )
            save_llm_config(
                AllLLMConfigs(mcpServers={SETTA_MCP_SERVER_ID: setta_server}),
                dbe,
            )

            initial = load_llm_config(dbe)
            assert "figma-desktop" in initial.mcpServers
            assert initial.codexMcpImportedAt is not None

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={SETTA_MCP_SERVER_ID: setta_server},
                    codexMcpImportedAt=initial.codexMcpImportedAt,
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "figma-desktop" not in loaded.mcpServers
            assert loaded.codexMcpImportedAt == initial.codexMcpImportedAt

    def test_load_llm_config_skips_codex_servers_with_unsupported_fields(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.figma-desktop]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.unsupported-auth]
transport = "streamable_http"
url = "http://127.0.0.1:5000/mcp"
auth_token = "token-value"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            warning_messages: list[str] = []

            def _capture_warning(
                message: str, *args: object, **_kwargs: object
            ) -> None:
                if args:
                    warning_messages.append(message % args)
                    return
                warning_messages.append(message)

            monkeypatch.setattr(codex_config_module.logger, "warning", _capture_warning)

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "figma-desktop" in loaded.mcpServers
            assert "unsupported-auth" not in loaded.mcpServers
            assert any(
                "Skipping Codex MCP server 'unsupported-auth'" in message
                for message in warning_messages
            )

    def test_load_llm_config_skips_codex_servers_with_conflicting_transport_shape(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.valid-http]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.conflict-stdio-url]
transport = "stdio"
url = "http://127.0.0.1:9000/mcp"

[mcp_servers.conflict-sse-command]
transport = "sse"
command = "node"
args = ["server.js"]
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            warning_messages: list[str] = []

            def _capture_warning(
                message: str, *args: object, **_kwargs: object
            ) -> None:
                if args:
                    warning_messages.append(message % args)
                    return
                warning_messages.append(message)

            monkeypatch.setattr(codex_config_module.logger, "warning", _capture_warning)

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "valid-http" in loaded.mcpServers
            assert "conflict-stdio-url" not in loaded.mcpServers
            assert "conflict-sse-command" not in loaded.mcpServers
            assert any(
                "Skipping Codex MCP server 'conflict-stdio-url'" in message
                for message in warning_messages
            )
            assert any(
                "Skipping Codex MCP server 'conflict-sse-command'" in message
                for message in warning_messages
            )

    def test_load_llm_config_reports_invalid_codex_server_ids_and_non_object_entries(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers]
invalid-shape = "not-an-object"

[mcp_servers.valid-http]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.bad__id]
command = "node"
args = ["server.js"]
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            warning_messages: list[str] = []

            def _capture_warning(
                message: str, *args: object, **_kwargs: object
            ) -> None:
                if args:
                    warning_messages.append(message % args)
                    return
                warning_messages.append(message)

            monkeypatch.setattr(codex_config_module.logger, "warning", _capture_warning)

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "valid-http" in loaded.mcpServers
            assert "bad__id" not in loaded.mcpServers
            assert "invalid-shape" not in loaded.mcpServers
            assert any(
                "Skipping Codex MCP server 'bad__id': server id cannot contain '__'"
                in message
                for message in warning_messages
            )
            assert any(
                "Skipping Codex MCP server 'invalid-shape': server 'invalid-shape' entry must be an object"
                in message
                for message in warning_messages
            )

    def test_load_llm_config_rejects_duplicate_canonical_codex_server_ids(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.foo]
command = "alpha"

[mcp_servers." foo "]
command = "beta"

[mcp_servers.valid-http]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            warning_messages: list[str] = []

            def _capture_warning(
                message: str, *args: object, **_kwargs: object
            ) -> None:
                if args:
                    warning_messages.append(message % args)
                    return
                warning_messages.append(message)

            monkeypatch.setattr(codex_config_module.logger, "warning", _capture_warning)

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "foo" not in loaded.mcpServers
            assert "valid-http" in loaded.mcpServers
            collision_messages = [
                message
                for message in warning_messages
                if "duplicate canonical server id" in message
            ]
            assert len(collision_messages) == 1
            collision_message = collision_messages[0]
            assert "canonical id 'foo'" in collision_message
            assert "'foo'" in collision_message
            assert "' foo '" in collision_message

    def test_load_llm_config_with_invalid_codex_home_does_not_fallback_to_home(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                "[mcp_servers.invalid\n",
                encoding="utf-8",
            )
            fallback_home = root / "fallback-home"
            (fallback_home / ".codex").mkdir(parents=True, exist_ok=True)
            (fallback_home / ".codex" / "config.toml").write_text(
                """
[mcp_servers.fallback-home-server]
transport = "streamable_http"
url = "http://127.0.0.1:9900/mcp"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            monkeypatch.setenv("HOME", str(fallback_home))

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "fallback-home-server" not in loaded.mcpServers

    def test_load_llm_config_with_missing_codex_home_file_does_not_fallback_to_home(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            fallback_home = root / "fallback-home"
            (fallback_home / ".codex").mkdir(parents=True, exist_ok=True)
            (fallback_home / ".codex" / "config.toml").write_text(
                """
[mcp_servers.fallback-home-server]
transport = "streamable_http"
url = "http://127.0.0.1:9900/mcp"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            monkeypatch.setenv("HOME", str(fallback_home))

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "fallback-home-server" not in loaded.mcpServers

    def test_load_codex_mcp_servers_with_empty_codex_home_env_fails_closed(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            # If CODEX_HOME is present but empty, fallback ~/.codex must not be consulted.
            root = Path(temp_dir)
            fallback_home = root / "fallback-home"
            (fallback_home / ".codex").mkdir(parents=True, exist_ok=True)
            (fallback_home / ".codex" / "config.toml").write_text(
                """
[mcp_servers.fallback-home-server]
transport = "streamable_http"
url = "http://127.0.0.1:9900/mcp"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("HOME", str(fallback_home))
            monkeypatch.setenv("CODEX_HOME", "")

            loaded_servers = codex_config_module.load_codex_mcp_servers_from_config()

            assert loaded_servers == {}

    def test_load_codex_mcp_servers_with_whitespace_codex_home_env_fails_closed(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            # Whitespace-only CODEX_HOME is also authoritative and must fail closed.
            root = Path(temp_dir)
            fallback_home = root / "fallback-home"
            (fallback_home / ".codex").mkdir(parents=True, exist_ok=True)
            (fallback_home / ".codex" / "config.toml").write_text(
                """
[mcp_servers.fallback-home-server]
transport = "streamable_http"
url = "http://127.0.0.1:9900/mcp"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("HOME", str(fallback_home))
            monkeypatch.setenv("CODEX_HOME", "   ")

            loaded_servers = codex_config_module.load_codex_mcp_servers_from_config()

            assert loaded_servers == {}

    def test_load_llm_config_retries_bootstrap_after_codex_parse_failure_is_fixed(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            codex_config_path = codex_home / "config.toml"
            codex_config_path.write_text(
                "[mcp_servers.invalid\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            initial = load_llm_config(dbe)

            assert "figma-desktop" not in initial.mcpServers
            assert initial.codexMcpImportedAt is None
            persisted_initial = dbe.read_llm_config()
            assert persisted_initial.get("codexMcpImportedAt") is None

            codex_config_path.write_text(
                """
[mcp_servers.figma-desktop]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"
""".strip()
                + "\n",
                encoding="utf-8",
            )

            loaded = load_llm_config(dbe)

            assert "figma-desktop" in loaded.mcpServers
            assert isinstance(loaded.codexMcpImportedAt, str)

    def test_load_llm_config_rejects_mixed_type_codex_args_and_env(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.valid]
command = "node"
args = ["server.js"]

[mcp_servers.invalid-args]
command = "node"
args = ["server.js", 123]

[mcp_servers.invalid-env]
command = "node"
env = { GOOD = "1", BAD = 2 }
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            warning_messages: list[str] = []

            def _capture_warning(
                message: str, *args: object, **_kwargs: object
            ) -> None:
                if args:
                    warning_messages.append(message % args)
                    return
                warning_messages.append(message)

            monkeypatch.setattr(codex_config_module.logger, "warning", _capture_warning)

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "valid" in loaded.mcpServers
            assert "invalid-args" not in loaded.mcpServers
            assert "invalid-env" not in loaded.mcpServers
            assert any("args[1]" in message for message in warning_messages)
            assert any("env.BAD" in message for message in warning_messages)

    def test_load_llm_config_rejects_codex_servers_with_invalid_scalar_field_types(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.valid]
command = "node"
args = ["server.js"]

[mcp_servers.invalid-transport]
transport = 123
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.invalid-encoding]
command = "node"
encoding = 123

[mcp_servers.invalid-command]
transport = "streamable_http"
url = "http://127.0.0.1:5000/mcp"
command = 789

[mcp_servers.invalid-cwd]
command = "node"
cwd = 789
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            warning_messages: list[str] = []

            def _capture_warning(
                message: str, *args: object, **_kwargs: object
            ) -> None:
                if args:
                    warning_messages.append(message % args)
                    return
                warning_messages.append(message)

            monkeypatch.setattr(codex_config_module.logger, "warning", _capture_warning)

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "valid" in loaded.mcpServers
            assert "invalid-transport" not in loaded.mcpServers
            assert "invalid-encoding" not in loaded.mcpServers
            assert "invalid-command" not in loaded.mcpServers
            assert "invalid-cwd" not in loaded.mcpServers
            assert any(
                "Skipping Codex MCP server 'invalid-transport'" in message
                for message in warning_messages
            )
            assert any(
                "transport must be a string" in message for message in warning_messages
            )
            assert any(
                "encoding must be a string" in message for message in warning_messages
            )
            assert any(
                "command must be a string" in message for message in warning_messages
            )
            assert any("cwd must be a string" in message for message in warning_messages)

    def test_load_llm_config_rejects_unsupported_encoding_error_handler(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.invalid-encoding]
command = "node"
encoding_error_handler = "surrogateescape"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            warning_messages: list[str] = []

            def _capture_warning(
                message: str, *args: object, **_kwargs: object
            ) -> None:
                if args:
                    warning_messages.append(message % args)
                    return
                warning_messages.append(message)

            monkeypatch.setattr(codex_config_module.logger, "warning", _capture_warning)

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "invalid-encoding" not in loaded.mcpServers
            assert any(
                "encoding_error_handler" in message for message in warning_messages
            )

    def test_load_llm_config_rejects_conflicting_http_header_aliases(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.valid-http]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.invalid-conflicting-headers]
transport = "streamable_http"
url = "http://127.0.0.1:5000/mcp"

[mcp_servers.invalid-conflicting-headers.http_headers]
Authorization = "Bearer new-token"

[mcp_servers.invalid-conflicting-headers.headers]
Authorization = "Bearer old-token"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            warning_messages: list[str] = []

            def _capture_warning(
                message: str, *args: object, **_kwargs: object
            ) -> None:
                if args:
                    warning_messages.append(message % args)
                    return
                warning_messages.append(message)

            monkeypatch.setattr(codex_config_module.logger, "warning", _capture_warning)

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "valid-http" in loaded.mcpServers
            assert "invalid-conflicting-headers" not in loaded.mcpServers
            assert any(
                "cannot define conflicting 'http_headers' and 'headers' values"
                in message
                for message in warning_messages
            )

    def test_load_llm_config_accepts_equal_http_header_aliases(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.alias-equal]
transport = "streamable_http"
url = "http://127.0.0.1:3845/mcp"

[mcp_servers.alias-equal.http_headers]
Authorization = "Bearer same-token"

[mcp_servers.alias-equal.headers]
Authorization = "Bearer same-token"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "alias-equal" in loaded.mcpServers
            alias_equal = loaded.mcpServers["alias-equal"]
            assert alias_equal.http_headers == {"Authorization": "Bearer same-token"}

    def test_load_llm_config_rejects_conflicting_snake_and_camel_mcp_tables(
        self,
        monkeypatch: pytest.MonkeyPatch,
    ) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            dbe = DBE(root / "setta_files")
            codex_home = root / "codex-home"
            codex_home.mkdir(parents=True, exist_ok=True)
            (codex_home / "config.toml").write_text(
                """
[mcp_servers.alpha]
command = "alpha"

[mcpServers.alpha]
command = "beta"
""".strip()
                + "\n",
                encoding="utf-8",
            )
            monkeypatch.setenv("CODEX_HOME", str(codex_home))
            warning_messages: list[str] = []

            def _capture_warning(
                message: str, *args: object, **_kwargs: object
            ) -> None:
                if args:
                    warning_messages.append(message % args)
                    return
                warning_messages.append(message)

            monkeypatch.setattr(codex_config_module.logger, "warning", _capture_warning)

            save_llm_config(
                AllLLMConfigs(
                    mcpServers={
                        SETTA_MCP_SERVER_ID: MCPServerConfig(
                            transport="sse",
                            url="http://127.0.0.1:8000/mcp",
                        )
                    }
                ),
                dbe,
            )

            loaded = load_llm_config(dbe)

            assert "alpha" not in loaded.mcpServers
            assert any(
                "Both 'mcp_servers' and 'mcpServers' are present with conflicting values"
                in message
                for message in warning_messages
            )


class TestLLMConfigExampleSeeding:
    def test_seed_llm_config_example_file_writes_default_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))

            seed_llm_config_example_file(dbe)

            payload = dbe.read_llm_config_example()
            configs = payload.get("configs", {})
            assert "claude-sonnet" in configs
            assert "openai-whisper-1" in configs
            assert "id" not in configs["claude-sonnet"]
            assert "id" not in configs["openai-whisper-1"]
            assert "context7" not in payload.get("mcpServers", {})

    def test_seed_llm_config_example_file_preserves_existing_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))
            dbe.write_llm_config_example(
                {
                    "configs": {
                        "existing": {
                            "model": "custom-model",
                        }
                    }
                }
            )

            seed_llm_config_example_file(dbe)

            payload = dbe.read_llm_config_example()
            assert payload["configs"] == {
                "existing": {
                    "model": "custom-model",
                }
            }
