import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError
from setta.database.db_objs import DBE
from setta.llm.config import load_llm_config, merge_chat_llm_configs, save_llm_config
from setta.llm.example_config import seed_llm_config_example_file
from setta.mcp.namespacing import SETTA_MCP_SERVER_ID
from setta.types.chat import ChatMetadata
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs, LLMConfig, MCPServerConfig

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


class MergeChatLLMConfigsTests(unittest.TestCase):
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

        self.assertEqual(set(merged.configs.keys()), {"primary"})
        self.assertFalse(merged.configs["primary"].temporary)

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

        self.assertEqual(len(merged.configs), 1)
        merged_config = next(iter(merged.configs.values()))
        self.assertTrue(merged_config.temporary)
        self.assertEqual(merged_config.model, "gpt-5.1")

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

        self.assertEqual(len(merged.configs), 2)
        temporary_configs = [cfg for cfg in merged.configs.values() if cfg.temporary]
        self.assertEqual(len(temporary_configs), 1)
        self.assertEqual(temporary_configs[0].model, "claude-3")


class AllLLMConfigsValidationTests(unittest.TestCase):
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

        self.assertEqual(config.configs["primary"].id, "primary")

    def test_rejects_inline_id_field(self) -> None:
        with self.assertRaises(ValidationError):
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


class MCPServerSelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.mcp_servers = {
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
        configs = AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="gpt-5.1",
                )
            },
            mcpServers=self.mcp_servers,
        )

        resolved = configs.resolve_mcp_server_ids(configs.configs["primary"])

        self.assertEqual(resolved, [SETTA_MCP_SERVER_ID, "github"])

    def test_resolves_default_mcp_server_ids(self) -> None:
        configs = AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="gpt-5.1",
                )
            },
            mcpServers=self.mcp_servers,
            defaultMcpServerIds=[SETTA_MCP_SERVER_ID],
        )

        resolved = configs.resolve_mcp_server_ids(configs.configs["primary"])

        self.assertEqual(resolved, [SETTA_MCP_SERVER_ID])

    def test_resolves_empty_mcp_server_ids(self) -> None:
        configs = AllLLMConfigs(
            configs={
                "primary": LLMConfig(
                    id="primary",
                    model="gpt-5.1",
                    mcpServerIds=[],
                )
            },
            mcpServers=self.mcp_servers,
            defaultMcpServerIds=[SETTA_MCP_SERVER_ID],
        )

        resolved = configs.resolve_mcp_server_ids(configs.configs["primary"])

        self.assertEqual(resolved, [])


class LLMConfigPersistenceTests(unittest.TestCase):
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

            self.assertNotIn("id", raw["configs"]["primary"])

            loaded = load_llm_config(dbe)
            self.assertEqual(loaded.configs["primary"].id, "primary")

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
            self.assertEqual(dbe.read_llm_config(), {})
            payload = dbe.read_llm_config_example()
            self.assertIn("secondary", payload["configs"])


class LLMConfigExampleSeedingTests(unittest.TestCase):
    def test_seed_llm_config_example_file_writes_default_payload(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            dbe = DBE(Path(temp_dir))

            seed_llm_config_example_file(dbe)

            payload = dbe.read_llm_config_example()
            configs = payload.get("configs", {})
            self.assertIn("claude-sonnet", configs)
            self.assertNotIn("id", configs["claude-sonnet"])

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
            self.assertEqual(
                payload["configs"],
                {
                    "existing": {
                        "model": "custom-model",
                    }
                },
            )


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
