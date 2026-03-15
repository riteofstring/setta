import sys
from pathlib import Path
from typing import Any


def register(plugin):
    server_path = Path(__file__).resolve().parent / "mini_language_server.py"
    plugin.register_language_server(
        {
            "language": "fixturedsl",
            "command": sys.executable,
            "args": [str(server_path)],
            "settingsKey": "fixtureDslLanguageServer",
        }
    )

    def setta_fixture_backend_language_server_tool(*, value: str) -> str:
        return f"language-server:{plugin.plugin_id}:{value}"

    plugin.register_mcp_tool(
        setta_fixture_backend_language_server_tool,
        name="setta_fixture_backend_language_server_tool",
        annotations={"accessType": "read"},
    )
