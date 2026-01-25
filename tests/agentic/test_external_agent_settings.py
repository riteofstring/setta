import json
from pathlib import Path
from tempfile import TemporaryDirectory
import tomllib

import pytest

from setta.agentic.external_agent_settings import (
    build_codex_settings_file,
    build_opencode_settings_file,
    write_claude_settings_file,
)
from setta.database.db_objs import DBE
from setta.types.external_agents import (
    ClaudeSettingsManaged,
    ClaudeSettingsPermissions,
    ExternalAgentConfig,
    ExternalAgentSettingsManagedBlock,
    ExternalAgentSettingsMode,
    ExternalAgentToolType,
    ExternalAgentRunMode,
)


def _build_dbe(tmpdir: str) -> DBE:
    root = Path(tmpdir) / "setta_files"
    root.mkdir(parents=True, exist_ok=True)
    return DBE(root)


class TestExternalAgentSettings:
    def test_write_claude_settings_file_managed_local(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_root = Path(tmpdir)
            config = ExternalAgentConfig(
                name="Claude",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                settingsMode=ExternalAgentSettingsMode.managed_local,
                settingsManagedBlock=ExternalAgentSettingsManagedBlock(
                    claude=ClaudeSettingsManaged(
                        permissions=ClaudeSettingsPermissions(
                            allow=["Read"],
                            ask=["Bash"],
                            deny=["Write"],
                        )
                    )
                ),
            )

            path = write_claude_settings_file(config, project_root=project_root)

            expected = project_root / ".claude" / "settings.local.json"
            assert path == expected
            payload = json.loads(expected.read_text(encoding="utf-8"))
            permissions = payload.get("permissions")
            assert isinstance(permissions, dict)
            if isinstance(permissions, dict):
                assert permissions.get("allow") == ["Read"]
                assert permissions.get("ask") == ["Bash"]
                assert permissions.get("deny") == ["Write"]

    def test_write_claude_settings_file_preserves_user_keys(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_root = Path(tmpdir)
            settings_dir = project_root / ".claude"
            settings_dir.mkdir(parents=True, exist_ok=True)
            settings_path = settings_dir / "settings.json"
            settings_path.write_text(
                json.dumps(
                    {
                        "userSetting": {"foo": "bar"},
                        "setta": {"permissions": {"allow": ["Old"]}},
                    }
                ),
                encoding="utf-8",
            )
            config = ExternalAgentConfig(
                name="Claude",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                settingsMode=ExternalAgentSettingsMode.managed_project,
                settingsAllowSettaEdits=True,
                settingsManagedBlock=ExternalAgentSettingsManagedBlock(
                    claude=ClaudeSettingsManaged(
                        permissions=ClaudeSettingsPermissions(
                            allow=["New"],
                            ask=[],
                            deny=[],
                        )
                    )
                ),
            )

            path = write_claude_settings_file(config, project_root=project_root)

            assert path == settings_path
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
            assert payload.get("userSetting") == {"foo": "bar"}
            permissions = payload.get("permissions")
            assert isinstance(permissions, dict)
            if isinstance(permissions, dict):
                assert permissions.get("allow") == ["New"]

    def test_write_claude_settings_file_read_only_skips(self) -> None:
        with TemporaryDirectory() as tmpdir:
            project_root = Path(tmpdir)
            config = ExternalAgentConfig(
                name="Claude",
                toolType=ExternalAgentToolType.claude_code,
                runMode=ExternalAgentRunMode.sdk,
                settingsMode=ExternalAgentSettingsMode.read_only,
            )

            path = write_claude_settings_file(config, project_root=project_root)

            assert path is None
            assert not (project_root / ".claude").exists()

    def test_build_codex_settings_file_explicit_path_read_only(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            base_path = Path(tmpdir) / "codex-base.toml"
            base_path.write_text(
                'model = "gpt-4o"\n[custom]\nvalue = "keep"\n',
                encoding="utf-8",
            )
            config = ExternalAgentConfig(
                id="codex-explicit",
                name="Codex",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                settingsMode=ExternalAgentSettingsMode.explicit_path,
                settingsFilePath=str(base_path),
                settingsAllowSettaEdits=False,
            )
            original = base_path.read_text(encoding="utf-8")

            output_dir = build_codex_settings_file(
                dbe,
                config,
                allowlist=None,
                mcp_url="http://localhost:8000/mcp",
                auth_headers=None,
                system_prompt=None,
            )

            output_path = output_dir / "config.toml"
            output_payload = tomllib.loads(output_path.read_text(encoding="utf-8"))
            assert output_payload.get("model") == "gpt-4o"
            assert output_payload.get("custom", {}).get("value") == "keep"
            mcp_servers = output_payload.get("mcp_servers")
            assert isinstance(mcp_servers, dict)
            if isinstance(mcp_servers, dict):
                assert (
                    mcp_servers.get("setta", {}).get("url")
                    == "http://localhost:8000/mcp"
                )
            assert base_path.read_text(encoding="utf-8") == original

    def test_build_codex_settings_file_sets_preferred_auth_method(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            config = ExternalAgentConfig(
                id="codex-auth",
                name="Codex",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                envVarWhitelist=["OPENAI_API_KEY"],
            )

            output_dir = build_codex_settings_file(
                dbe,
                config,
                allowlist=None,
                mcp_url="http://localhost:8000/mcp",
                auth_headers=None,
                system_prompt=None,
            )

            output_path = output_dir / "config.toml"
            output_payload = tomllib.loads(output_path.read_text(encoding="utf-8"))
            assert output_payload.get("forced_login_method") == "api"
            assert output_payload.get("preferred_auth_method") == "apikey"
            assert output_payload.get("cli_auth_credentials_store") == "file"
            assert output_payload.get("model_reasoning_summary") == "none"

    def test_build_codex_settings_file_appends_system_prompt(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            base_path = Path(tmpdir) / "codex-base.toml"
            base_path.write_text(
                'developer_instructions = "Base instructions"\n',
                encoding="utf-8",
            )
            config = ExternalAgentConfig(
                id="codex-system",
                name="Codex",
                toolType=ExternalAgentToolType.codex,
                runMode=ExternalAgentRunMode.app_server,
                settingsMode=ExternalAgentSettingsMode.explicit_path,
                settingsFilePath=str(base_path),
                settingsAllowSettaEdits=False,
            )
            original = base_path.read_text(encoding="utf-8")

            output_dir = build_codex_settings_file(
                dbe,
                config,
                allowlist=None,
                mcp_url="http://localhost:8000/mcp",
                auth_headers=None,
                system_prompt="Setta instructions",
            )

            output_path = output_dir / "config.toml"
            output_payload = tomllib.loads(output_path.read_text(encoding="utf-8"))
            assert (
                output_payload.get("developer_instructions")
                == "Setta instructions\n\nBase instructions"
            )
            assert base_path.read_text(encoding="utf-8") == original

    def test_build_opencode_settings_file_explicit_path_read_only(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            base_path = Path(tmpdir) / "opencode-base.json"
            base_payload = {
                "model": "gpt-4o-mini",
                "permission": {"run": "ask"},
                "mcp": {"other": {"url": "http://example.com"}},
            }
            base_path.write_text(json.dumps(base_payload), encoding="utf-8")
            config = ExternalAgentConfig(
                id="opencode-explicit",
                name="OpenCode",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
                settingsMode=ExternalAgentSettingsMode.explicit_path,
                settingsFilePath=str(base_path),
                settingsAllowSettaEdits=False,
            )
            original = base_path.read_text(encoding="utf-8")

            output_path = build_opencode_settings_file(
                dbe,
                config,
                allowlist=None,
                mcp_url="http://localhost:8000/mcp",
                auth_headers=None,
            )

            output_payload = json.loads(output_path.read_text(encoding="utf-8"))
            assert output_payload.get("model") == "gpt-4o-mini"
            assert output_payload.get("permission") == {"run": "ask"}
            mcp = output_payload.get("mcp")
            assert isinstance(mcp, dict)
            if isinstance(mcp, dict):
                assert (
                    mcp.get("setta", {}).get("url")
                    == "http://localhost:8000/mcp"
                )
                assert mcp.get("other", {}).get("url") == "http://example.com"
            assert base_path.read_text(encoding="utf-8") == original

    def test_build_opencode_settings_file_forces_openai_text_verbosity(self) -> None:
        with TemporaryDirectory() as tmpdir:
            dbe = _build_dbe(tmpdir)
            base_path = Path(tmpdir) / "opencode-verbosity.json"
            base_payload = {
                "provider": {
                    "openai": {
                        "models": {
                            "gpt-5.2-chat-latest": {
                                "options": {"text": {"verbosity": "low"}}
                            }
                        }
                    }
                }
            }
            base_path.write_text(json.dumps(base_payload), encoding="utf-8")
            config = ExternalAgentConfig(
                id="opencode-verbosity",
                name="OpenCode",
                toolType=ExternalAgentToolType.opencode,
                runMode=ExternalAgentRunMode.sdk,
                settingsMode=ExternalAgentSettingsMode.explicit_path,
                settingsFilePath=str(base_path),
                settingsAllowSettaEdits=True,
            )

            output_path = build_opencode_settings_file(
                dbe,
                config,
                allowlist=None,
                mcp_url="http://localhost:8000/mcp",
                auth_headers=None,
            )

            output_payload = json.loads(output_path.read_text(encoding="utf-8"))
            provider = output_payload.get("provider")
            assert isinstance(provider, dict)
            openai = provider.get("openai")
            assert isinstance(openai, dict)
            models = openai.get("models")
            assert isinstance(models, dict)
            model_entry = models.get("gpt-5.2-chat-latest")
            assert isinstance(model_entry, dict)
            options = model_entry.get("options")
            assert isinstance(options, dict)
            assert options.get("textVerbosity") == "medium"
            assert "text" not in options
