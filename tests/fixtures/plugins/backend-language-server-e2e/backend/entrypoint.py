import sys
from pathlib import Path


def register(plugin):
    server_path = Path(__file__).resolve().parent / "mini_language_server.py"
    plugin.register_language_server(
        {
            "language": "typescript",
            "command": sys.executable,
            "args": [str(server_path)],
            "settingsKey": "fixtureTypescriptLanguageServer",
        }
    )
