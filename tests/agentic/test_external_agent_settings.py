import json
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory
import tomllib

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


class ExternalAgentSettingsTests(unittest.TestCase):
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
            self.assertEqual(path, expected)
            payload = json.loads(expected.read_text(encoding="utf-8"))
            permissions = payload.get("permissions")
            self.assertIsInstance(permissions, dict)
            if isinstance(permissions, dict):
                self.assertEqual(permissions.get("allow"), ["Read"])
                self.assertEqual(permissions.get("ask"), ["Bash"])
                self.assertEqual(permissions.get("deny"), ["Write"])

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

            self.assertEqual(path, settings_path)
            payload = json.loads(settings_path.read_text(encoding="utf-8"))
            self.assertEqual(payload.get("userSetting"), {"foo": "bar"})
            permissions = payload.get("permissions")
            self.assertIsInstance(permissions, dict)
            if isinstance(permissions, dict):
                self.assertEqual(permissions.get("allow"), ["New"])

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

            self.assertIsNone(path)
            self.assertFalse((project_root / ".claude").exists())

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
                runMode=ExternalAgentRunMode.sdk,
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
            )

            output_path = output_dir / "config.toml"
            output_payload = tomllib.loads(output_path.read_text(encoding="utf-8"))
            self.assertEqual(output_payload.get("model"), "gpt-4o")
            self.assertEqual(output_payload.get("custom", {}).get("value"), "keep")
            mcp_servers = output_payload.get("mcp_servers")
            self.assertIsInstance(mcp_servers, dict)
            if isinstance(mcp_servers, dict):
                self.assertEqual(
                    mcp_servers.get("setta", {}).get("url"),
                    "http://localhost:8000/mcp",
                )
            self.assertEqual(base_path.read_text(encoding="utf-8"), original)

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
            self.assertEqual(output_payload.get("model"), "gpt-4o-mini")
            self.assertEqual(output_payload.get("permission"), {"run": "ask"})
            mcp = output_payload.get("mcp")
            self.assertIsInstance(mcp, dict)
            if isinstance(mcp, dict):
                self.assertEqual(
                    mcp.get("setta", {}).get("url"),
                    "http://localhost:8000/mcp",
                )
                self.assertEqual(
                    mcp.get("other", {}).get("url"),
                    "http://example.com",
                )
            self.assertEqual(base_path.read_text(encoding="utf-8"), original)
