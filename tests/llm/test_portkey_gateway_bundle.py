import unittest

from setta.llm.dev_gateway import bundled_gateway_path, has_bundled_gateway


class PortkeyGatewayBundleTests(unittest.TestCase):
    def test_bundled_gateway_assets_present(self) -> None:
        gateway_dir = bundled_gateway_path()
        start_script = gateway_dir / "build" / "start-server.js"
        self.assertTrue(
            has_bundled_gateway(), "Bundled Portkey gateway start script is missing."
        )
        self.assertTrue(start_script.is_file(), "start-server.js not found")
        self.assertTrue(
            (gateway_dir / "package.json").is_file(),
            "Bundled gateway package.json missing",
        )
        self.assertTrue(
            (gateway_dir / "node_modules").is_dir(),
            "Bundled gateway dependencies missing",
        )


if __name__ == "__main__":
    unittest.main()
