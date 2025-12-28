import tempfile
import unittest
from pathlib import Path

from setta.start import _render_startup_message
from setta.types.routes import Route


class StartupMessageTests(unittest.TestCase):
    def test_startup_message_auto_open(self) -> None:
        message = _render_startup_message(
            session_id="abc123",
            host="127.0.0.1",
            port=61234,
            workspace_path=Path("/work/project"),
            bootstrap_url_fragment="http://127.0.0.1:61234/__setta__/bootstrap#token=tok",
            token="tok",
            auto_open=True,
        )

        self.assertIn("Setta running (session abc123)", message)
        self.assertIn("Bind: 127.0.0.1:61234 (remote only)", message)
        self.assertIn("Opening browser to:", message)
        self.assertIn("/__setta__/bootstrap#token=tok", message)
        self.assertNotIn("Manual tunnel", message)

    def test_startup_message_manual_tunnel(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            workspace = Path(temp_dir) / "my project"
            workspace.mkdir()

            message = _render_startup_message(
                session_id="def456",
                host="127.0.0.1",
                port=61234,
                workspace_path=workspace,
                bootstrap_url_fragment="http://127.0.0.1:61234/__setta__/bootstrap#token=tok2",
                token="tok2",
                auto_open=False,
            )

        self.assertIn("Manual tunnel", message)
        self.assertIn("LOCAL_PORT=61000", message)
        self.assertIn(
            f"ssh -N -L ${'{'}LOCAL_PORT{'}'}:127.0.0.1:61234",
            message,
        )
        self.assertIn(f"{Route.BOOTSTRAP_PAGE.value}#token=tok2", message)
        self.assertIn(f"{Route.BOOTSTRAP_PAGE.value}", message)
        self.assertIn("and paste:", message)
        self.assertIn("tok2", message)
        self.assertIn("--workspace '", message)
        self.assertIn("' --session def456", message)


if __name__ == "__main__":
    unittest.main()
