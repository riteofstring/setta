def register(plugin):
    plugin.register_language_server(
        {
            "language": "typescript",
            "command": "typescript-language-server",
            "args": ["--stdio"],
            "settingsKey": "typescriptLanguageServer",
        }
    )
