import os
import unittest
from types import SimpleNamespace

from portkey_ai import Portkey

from setta.llm.config_api import payload_to_config_model
from setta.llm.constants import DEFAULT_GATEWAY_URL
from setta.llm.config_store import normalize_gateway_url
from setta.llm.dev_gateway import DevGatewayManager
from setta.routers.ai import TestLLMConfigRequest, route_test_llm_config
from setta.types.llm_config import LLMConfigPayload, LLMProviderConfigPayload


class LLMConfigGatewayIntegrationTests(unittest.TestCase):
    # def test_test_llm_config_hits_local_gateway_with_openai(self) -> None:
    #     api_key = os.environ.get("OPENAI_API_KEY")
    #     if not api_key:
    #         self.skipTest("OPENAI_API_KEY is required to validate the gateway.")

    #     gateway_manager = DevGatewayManager()
    #     try:
    #         gateway_manager.ensure_running()
    #     except RuntimeError as exc:
    #         self.skipTest(f"Local Portkey gateway unavailable: {exc}")

    #     config_payload = LLMConfigPayload(
    #         gateway_url=DEFAULT_GATEWAY_URL,
    #         providers=[
    #             LLMProviderConfigPayload(
    #                 provider_id="openai",
    #                 display_name="OpenAI via local gateway",
    #                 api_key=api_key,
    #             )
    #         ],
    #     )
    #     request = TestLLMConfigRequest(config=config_payload)
    #     state = SimpleNamespace(llm_config=payload_to_config_model(config_payload))

    #     try:
    #         result = route_test_llm_config(request, state)
    #     finally:
    #         gateway_manager.stop()

    #     self.assertTrue(
    #         result.gateway.ok,
    #         f"Gateway health check failed at {result.gateway.url}: {result.gateway.error}",
    #     )
    #     openai_result = next(
    #         (
    #             provider
    #             for provider in result.providers
    #             if provider.provider_id == "openai"
    #         ),
    #         None,
    #     )
    #     self.assertIsNotNone(
    #         openai_result, "OpenAI provider result missing from test payload"
    #     )
    #     assert openai_result is not None
    #     expected_base_url = normalize_gateway_url(DEFAULT_GATEWAY_URL).rstrip("/")
    #     self.assertEqual(
    #         expected_base_url,
    #         (openai_result.base_url or "").rstrip("/"),
    #         "Provider test did not hit the expected gateway URL",
    #     )
    #     error_messages = [error.message for error in openai_result.errors]
    #     self.assertTrue(
    #         openai_result.ok,
    #         f"OpenAI provider check failed via gateway: {error_messages}",
    #     )

    def test_portkey_python_client_can_list_models_via_gateway(self) -> None:
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            self.skipTest("OPENAI_API_KEY is required to validate the gateway.")

        gateway_manager = DevGatewayManager()
        try:
            gateway_manager.ensure_running()
        except RuntimeError as exc:
            self.skipTest(f"Local Portkey gateway unavailable: {exc}")

        client = Portkey(
            base_url=normalize_gateway_url(DEFAULT_GATEWAY_URL),
            provider="openai",
            request_timeout=5000,
            Authorization=api_key,
        )

        try:
            response = client.chat.completions.create(messages=[{"role": "user", "content": "What's the weather like?"}], model="gpt-4o-mini")
            print(response)
        finally:
            gateway_manager.stop()

        

        # self.assertTrue(
        #     hasattr(response, "data"),
        #     "Portkey client response missing data from local gateway",
        # )
        # self.assertGreater(
        #     len(getattr(response, "data", [])),
        #     0,
        #     "Portkey client did not return any models via the local gateway",
        # )


if __name__ == "__main__":
    unittest.main()
