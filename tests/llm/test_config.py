import tempfile
import unittest
from datetime import datetime
from pathlib import Path

from pydantic import ValidationError
from setta.database.db_objs import DBE
from setta.llm.config import load_llm_config, merge_chat_llm_configs, save_llm_config
from setta.types.chat import ChatMetadata
from setta.types.llm_config import AllLLMConfigs, LLMConfig


def _build_chat_metadata(name: str, llm_config: LLMConfig) -> ChatMetadata:
    return ChatMetadata(
        id=f"chat-{name}",
        name=name,
        lastUpdated=datetime.now(),
        llmConfig=llm_config,
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


if __name__ == "__main__":  # pragma: no cover
    unittest.main()
