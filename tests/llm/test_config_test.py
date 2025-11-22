import unittest

from setta.llm import (
    LLMConfig,
    LLMProjectConfig,
    LLMProviderConfig,
)
from setta.llm.config_test import test_llm_config


class ConfigValidationTests(unittest.TestCase):
    def test_scoped_provider_results_include_project_ids(self) -> None:
        config = LLMConfig(
            gateway_url="http://127.0.0.1:0",
            providers=[
                LLMProviderConfig(
                    provider_id="openai",
                    display_name="Default OpenAI",
                    base_url="http://127.0.0.1:0",
                )
            ],
            project_configs={
                "proj-1": LLMProjectConfig(
                    project_config_id="proj-1",
                    providers=[
                        LLMProviderConfig(
                            provider_id="openai",
                            display_name="Project One OpenAI",
                            base_url="http://127.0.0.1:0",
                        ),
                        LLMProviderConfig(
                            provider_id="openai",
                            display_name="Duplicate should be ignored",
                            base_url="http://127.0.0.1:0",
                        ),
                    ],
                ),
                "proj-2": LLMProjectConfig(
                    project_config_id="proj-2",
                    providers=[
                        LLMProviderConfig(
                            provider_id="openai",
                            display_name="Project Two OpenAI",
                            base_url="http://127.0.0.1:0",
                        )
                    ],
                ),
            },
        )

        result = test_llm_config(config, timeout=0.01)

        scopes = {
            (provider.project_config_id, provider.provider_id)
            for provider in result.providers
        }
        self.assertIn((None, "openai"), scopes)
        self.assertIn(("proj-1", "openai"), scopes)
        self.assertIn(("proj-2", "openai"), scopes)
        self.assertEqual(len(scopes), len(result.providers))

        project_one = next(
            provider
            for provider in result.providers
            if provider.project_config_id == "proj-1"
        )
        self.assertEqual(project_one.display_name, "Project One OpenAI")


if __name__ == "__main__":
    unittest.main()
