import unittest

from setta.llm import (
    LLMConfig,
    LLMModelConfig,
    LLMProjectConfig,
    LLMProviderConfig,
    add_preset,
    build_request_context,
    validate_request,
)
from setta.llm.config_store import infer_provider_headers, normalize_gateway_url
from setta.types.llm_config import LLMModelConfigPayload, LLMProviderConfigPayload
from setta.types.chat_messages import LLMModelSelection


class ConfigStoreAddPresetTests(unittest.TestCase):
    def test_add_preset_populates_default_provider(self) -> None:
        config = LLMConfig()

        provider = add_preset(config, preset_id="openai")

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

        provider = add_preset(config, preset_id="openai")

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

        provider = add_preset(
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

        provider = add_preset(
            config,
            preset_id="openai",
            project_config_id="proj-1",
        )

        self.assertEqual(config.providers, [])
        self.assertEqual(project.providers, [provider])


class ConfigSerializationRoundTripTests(unittest.TestCase):
    def test_preset_config_round_trip_preserves_overrides(self) -> None:
        llm_config = LLMConfig(
            gateway_url="http://gateway",
            default_project_config_id="proj-1",
            project_configs={
                "proj-1": LLMProjectConfig(project_config_id="proj-1"),
            },
        )
        default_provider = add_preset(llm_config, preset_id="openai")
        overrides = LLMProviderConfigPayload(
            provider_id="openai-sandbox",
            display_name="OpenAI Sandbox",
            default_model_id="gpt-4o",
            models=[
                LLMModelConfigPayload(
                    preset_id="gpt-4o-mini",
                    default_parameters={"temperature": 0.3},
                )
            ],
        )

        scoped_provider = add_preset(
            llm_config,
            preset_id="openai",
            overrides=overrides,
            project_config_id="proj-1",
        )

        serialized = llm_config.to_dict()

        self.assertEqual(serialized["providers"], [{"preset_id": "openai"}])
        project_payload = serialized["project_configs"]["proj-1"]["providers"][0]
        self.assertEqual(project_payload["preset_id"], "openai")
        self.assertEqual(project_payload["provider_id"], "openai-sandbox")
        self.assertEqual(project_payload["display_name"], "OpenAI Sandbox")
        self.assertEqual(project_payload["default_model_id"], "gpt-4o")
        models_payload = project_payload["models"]
        self.assertEqual(models_payload[0]["preset_id"], "gpt-4o-mini")
        self.assertEqual(models_payload[0]["default_parameters"], {"temperature": 0.3})

        restored = LLMConfig.from_dict(serialized)

        self.assertEqual(len(restored.providers), 1)
        restored_default = restored.providers[0]
        self.assertEqual(restored_default.provider_id, default_provider.provider_id)
        self.assertEqual(
            restored_default.default_model_id, default_provider.default_model_id
        )
        restored_model_ids = {model.model_id for model in restored_default.models}
        self.assertTrue({"gpt-4o", "gpt-4o-mini"}.issubset(restored_model_ids))

        scoped_restored = restored.project_configs["proj-1"].providers[0]
        self.assertEqual(scoped_restored.provider_id, scoped_provider.provider_id)
        self.assertEqual(scoped_restored.display_name, scoped_provider.display_name)
        self.assertEqual(scoped_restored.default_model_id, "gpt-4o")
        tuned_model = next(
            model for model in scoped_restored.models if model.preset_id == "gpt-4o-mini"
        )
        self.assertEqual(tuned_model.default_parameters, {"temperature": 0.3})


class ConfigProviderResolutionTests(unittest.TestCase):
    def test_providers_for_project_rejects_unknown_scope(self) -> None:
        default_provider = LLMProviderConfig(
            provider_id="openai",
            display_name="OpenAI",
            models=[
                LLMModelConfig(
                    model_id="gpt-4o",
                    display_name="GPT-4o",
                )
            ],
        )
        config = LLMConfig(
            default_project_config_id="proj-default",
            project_configs={
                "proj-default": LLMProjectConfig(
                    project_config_id="proj-default",
                    providers=[default_provider],
                )
            },
        )

        with self.assertRaisesRegex(
            ValueError,
            "Unknown project config: proj-missing",
        ):
            config.providers_for_project("proj-missing")


class ConfigValidationHelperTests(unittest.TestCase):
    def test_validate_llm_request_requires_credentials(self) -> None:
        provider = LLMProviderConfig(
            provider_id="openai",
            display_name="OpenAI",
        )
        model = LLMModelConfig(model_id="gpt-4o", display_name="GPT-4o")

        with self.assertRaisesRegex(
            ValueError, "Provider 'OpenAI' is missing credentials."
        ):
            validate_request(provider, model, deep_think=False)

    def test_validate_llm_request_allows_authorization_header(self) -> None:
        provider = LLMProviderConfig(
            provider_id="openai",
            display_name="OpenAI",
            extra_headers={"Authorization": "Bearer test"},
        )
        model = LLMModelConfig(
            model_id="gpt-4o",
            display_name="GPT-4o",
            supports_reasoning=True,
        )

        params = validate_request(provider, model, deep_think=True)

        self.assertIn("reasoning", params or {})
        reasoning = params["reasoning"]
        self.assertIsInstance(reasoning, dict)
        self.assertEqual(reasoning.get("effort"), "medium")


class ConfigRequestContextTests(unittest.TestCase):
    def test_build_request_context_uses_scoped_config_and_reasoning(self) -> None:
        config = LLMConfig(
            default_project_config_id="proj-1",
            project_configs={
                "proj-1": LLMProjectConfig(
                    project_config_id="proj-1",
                    providers=[
                        LLMProviderConfig(
                            provider_id="openai",
                            display_name="OpenAI Scoped",
                            api_key="sk-test",
                            extra_headers={"Authorization": "Bearer scoped"},
                            models=[
                                LLMModelConfig(
                                    model_id="gpt-4o",
                                    display_name="GPT-4o",
                                    supports_reasoning=True,
                                    default_parameters={"temperature": 0.2},
                                )
                            ],
                        )
                    ],
                )
            },
        )
        selection = LLMModelSelection(providerId="openai", modelId="gpt-4o")

        context = build_request_context(
            config,
            selection,
            project_config_id=None,
            deep_think=True,
        )

        self.assertEqual(context.project_config_id, "proj-1")
        self.assertEqual(context.provider.display_name, "OpenAI Scoped")
        self.assertEqual(context.model.model_id, "gpt-4o")
        self.assertEqual(context.request_params["reasoning"]["effort"], "medium")
        self.assertEqual(context.extra_headers, {"Authorization": "Bearer scoped"})

    def test_build_request_context_requires_credentials(self) -> None:
        config = LLMConfig(
            providers=[
                LLMProviderConfig(
                    provider_id="anthropic",
                    display_name="Anthropic",
                    models=[
                        LLMModelConfig(
                            model_id="claude-3",
                            display_name="Claude 3",
                            supports_reasoning=False,
                        )
                    ],
                )
            ]
        )
        selection = LLMModelSelection(providerId="anthropic", modelId="claude-3")

        with self.assertRaisesRegex(ValueError, "missing credentials"):
            build_request_context(
                config,
                selection,
                project_config_id=None,
                deep_think=False,
            )

    def test_build_request_context_adds_authorization_header(self) -> None:
        config = LLMConfig(
            providers=[
                LLMProviderConfig(
                    provider_id="openai",
                    display_name="OpenAI",
                    api_key="sk-test-key",
                    models=[
                        LLMModelConfig(
                            model_id="gpt-4o",
                            display_name="GPT-4o",
                        )
                    ],
                )
            ]
        )
        selection = LLMModelSelection(providerId="openai", modelId="gpt-4o")

        context = build_request_context(
            config,
            selection,
            project_config_id=None,
            deep_think=False,
        )

        self.assertEqual(
            context.extra_headers,
            {"Authorization": "Bearer sk-test-key"},
        )


class ConfigDefaultHelperTests(unittest.TestCase):
    def test_infer_provider_headers_promotes_api_key(self) -> None:
        provider = LLMProviderConfig(
            provider_id="openai",
            display_name="OpenAI",
            api_key="sk-test",
        )

        headers = infer_provider_headers(provider)

        self.assertEqual(headers, {"Authorization": "Bearer sk-test"})

    def test_infer_provider_headers_respects_existing_authorization(self) -> None:
        provider = LLMProviderConfig(
            provider_id="openai",
            display_name="OpenAI",
            api_key="sk-test",
            extra_headers={"Authorization": "Token existing"},
        )

        headers = infer_provider_headers(provider)

        self.assertEqual(headers, {"Authorization": "Token existing"})

    def test_infer_provider_headers_can_skip_authed_header(self) -> None:
        provider = LLMProviderConfig(
            provider_id="openai",
            display_name="OpenAI",
            api_key="sk-test",
        )

        headers = infer_provider_headers(provider, include_authorization=False)

        self.assertIsNone(headers)

    def test_normalize_gateway_url_appends_version_path(self) -> None:
        normalized = normalize_gateway_url("http://127.0.0.1:8787/")

        self.assertEqual(normalized, "http://127.0.0.1:8787/v1")

    def test_normalize_gateway_url_preserves_existing_path(self) -> None:
        normalized = normalize_gateway_url("http://example.com/api/v2")

        self.assertEqual(normalized, "http://example.com/api/v2")


if __name__ == "__main__":
    unittest.main()
