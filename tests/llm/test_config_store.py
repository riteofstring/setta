import unittest

from setta.llm.config_store import (
    LLMConfig,
    LLMModelConfig,
    LLMProjectConfig,
    LLMProviderConfig,
    add_preset_to_config,
)
from setta.types.llm_config import LLMModelConfigPayload, LLMProviderConfigPayload


class ConfigStoreAddPresetTests(unittest.TestCase):
    def test_add_preset_populates_default_provider(self) -> None:
        config = LLMConfig()

        provider = add_preset_to_config(config, preset_id="openai")

        self.assertEqual(len(config.providers), 1)
        self.assertEqual(provider.preset_id, "openai")
        self.assertEqual(provider.provider_id, "openai")
        model_ids = {model.model_id for model in provider.models}
        self.assertTrue({"gpt-4o-mini", "gpt-4o"}.issubset(model_ids))

    def test_add_preset_rebuilds_existing_provider_with_overrides(self) -> None:
        config = LLMConfig(
            providers=[
                LLMProviderConfig(
                    provider_id="openai",
                    display_name="OpenAI Prod",
                    api_key="sk-live",
                    base_url="https://custom/v1",
                    default_model_id="gpt-4o",
                    extra_headers={"X-Test": "1"},
                    models=[
                        LLMModelConfig(
                            model_id="gpt-4o",
                            display_name="GPT-4o tuned",
                            supports_reasoning=False,
                            default_parameters={"temperature": 0.1},
                        )
                    ],
                )
            ]
        )

        provider = add_preset_to_config(config, preset_id="openai")

        self.assertEqual(provider.preset_id, "openai")
        self.assertEqual(provider.api_key, "sk-live")
        self.assertEqual(provider.base_url, "https://custom/v1")
        self.assertEqual(provider.display_name, "OpenAI Prod")
        self.assertEqual(provider.default_model_id, "gpt-4o")
        self.assertEqual(provider.extra_headers, {"X-Test": "1"})
        model_ids = {model.model_id for model in provider.models}
        self.assertIn("gpt-4o-mini", model_ids)
        tuned_model = next(
            model for model in provider.models if model.model_id == "gpt-4o"
        )
        self.assertEqual(tuned_model.display_name, "GPT-4o tuned")
        self.assertFalse(tuned_model.supports_reasoning)
        self.assertEqual(tuned_model.default_parameters, {"temperature": 0.1})

    def test_add_preset_accepts_explicit_overrides(self) -> None:
        config = LLMConfig()
        overrides = LLMProviderConfigPayload(
            provider_id="openai-dev",
            display_name="OpenAI Dev",
            default_model_id="gpt-4o-mini",
            models=[
                LLMModelConfigPayload(
                    model_id="gpt-4o-mini",
                    display_name="Mini custom",
                )
            ],
        )

        provider = add_preset_to_config(
            config,
            preset_id="openai",
            overrides=overrides,
        )

        self.assertEqual(provider.provider_id, "openai-dev")
        self.assertEqual(provider.display_name, "OpenAI Dev")
        self.assertEqual(provider.default_model_id, "gpt-4o-mini")
        mini_model = next(
            model for model in provider.models if model.model_id == "gpt-4o-mini"
        )
        self.assertEqual(mini_model.display_name, "Mini custom")

    def test_add_preset_handles_project_scoped_configs(self) -> None:
        project = LLMProjectConfig(project_config_id="proj-1")
        config = LLMConfig(
            project_configs={
                "proj-1": project,
            }
        )

        provider = add_preset_to_config(
            config,
            preset_id="openai",
            project_config_id="proj-1",
        )

        self.assertEqual(config.providers, [])
        self.assertEqual(project.providers, [provider])


if __name__ == "__main__":
    unittest.main()
