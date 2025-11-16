import os
import unittest
from unittest.mock import patch

from setta.llm.config_store import LLMConfig
from setta.llm.local_gateway import (
    DEFAULT_LOCAL_GATEWAY_PORT,
    should_start_local_gateway,
)


class ShouldStartGatewayTests(unittest.TestCase):
    def test_loopback_default_port_enables_gateway(self) -> None:
        config = LLMConfig(
            gateway_url=f"http://127.0.0.1:{DEFAULT_LOCAL_GATEWAY_PORT}",
        )
        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(should_start_local_gateway(config))

    def test_localhost_default_port_enables_gateway(self) -> None:
        config = LLMConfig(
            gateway_url=f"http://localhost:{DEFAULT_LOCAL_GATEWAY_PORT}/v1",
        )
        with patch.dict(os.environ, {}, clear=True):
            self.assertTrue(should_start_local_gateway(config))

    def test_remote_gateway_skips_bootstrap(self) -> None:
        config = LLMConfig(gateway_url="https://gateway.example.com/v1")
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(should_start_local_gateway(config))

    def test_custom_port_skips_bootstrap(self) -> None:
        config = LLMConfig(gateway_url="http://127.0.0.1:9999")
        with patch.dict(os.environ, {}, clear=True):
            self.assertFalse(should_start_local_gateway(config))

    def test_env_toggle_disables_bootstrap(self) -> None:
        config = LLMConfig(
            gateway_url=f"http://127.0.0.1:{DEFAULT_LOCAL_GATEWAY_PORT}",
        )
        with patch.dict(os.environ, {"SETTA_DISABLE_LOCAL_GATEWAY": "1"}, clear=True):
            self.assertFalse(should_start_local_gateway(config))


if __name__ == "__main__":
    unittest.main()
