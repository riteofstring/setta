import sys


def register(plugin):
    plugin.register_language_server(
        {
            "language": "typescript",
            "command": sys.executable,
            "args": ["--stdio"],
            "settingsKey": "typescriptLanguageServer",
        }
    )
