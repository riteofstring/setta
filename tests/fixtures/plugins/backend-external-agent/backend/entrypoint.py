import sys
from pathlib import Path


def register(plugin):
    script_path = Path(__file__).resolve().parent / "mini_external_agent.py"
    plugin.register_external_agent_adapter(
        {
            "id": "fixture-agent",
            "name": "Fixture External Agent",
            "runModes": ["sdk"],
            "command": sys.executable,
            "args": [str(script_path)],
            "envVarWhitelist": ["FIXTURE_EXTERNAL_AGENT_TOKEN"],
            "defaultModel": "fixture-model",
        }
    )
