import tempfile
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError
import pytest
import setta.llm.config as llm_config_module
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

    def test_load_llm_config_uses_example_when_not_in_dev_mode(self, monkeypatch) -> None:
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

            persisted = dbe.read_llm_config()
            persisted_mcp = persisted.get("mcpServers", {})
            assert "figma-desktop" in persisted_mcp
            assert "pencil" in persisted_mcp

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

            def _capture_warning(message: str, *args: object, **_kwargs: object) -> None:
                if args:
                    warning_messages.append(message % args)
                    return
                warning_messages.append(message)

            monkeypatch.setattr(llm_config_module.logger, "warning", _capture_warning)

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
