import json
import os
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

import setta.agentic.external_agent_preflight as preflight
from setta.agentic.external_agent_preflight import (
    build_external_agent_preflight_status,
)
from setta.database.db_objs import DBE
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
)


def _restore_env_var(key: str, value: str | None) -> None:
    if value is None:
        os.environ.pop(key, None)
        return
    os.environ[key] = value


class ExternalAgentPreflightTests(unittest.TestCase):
    def _temp_cwd(self) -> Path:
        tmp_dir = TemporaryDirectory()
        self.addCleanup(tmp_dir.cleanup)
        previous = os.getcwd()
        os.chdir(tmp_dir.name)
        self.addCleanup(lambda: os.chdir(previous))
        return Path(tmp_dir.name)

    def _build_config(
        self,
        *,
        tool_type: ExternalAgentToolType = ExternalAgentToolType.codex,
        run_mode: ExternalAgentRunMode,
        command_path: str | None = None,
        env_vars: list[str] | None = None,
    ) -> ExternalAgentConfig:
        return ExternalAgentConfig(
            name="Test config",
            toolType=tool_type,
            runMode=run_mode,
            commandPath=command_path,
            envVarWhitelist=env_vars or [],
        )

    def test_env_var_status_reads_dot_env(self) -> None:
        tmp = self._temp_cwd()
        dbe = DBE(tmp / "setta_files")
        key_present = "SETTA_TEST_ENV_PRESENT"
        key_missing = "SETTA_TEST_ENV_MISSING"

        previous_present = os.environ.pop(key_present, None)
        previous_missing = os.environ.pop(key_missing, None)
        self.addCleanup(lambda: _restore_env_var(key_present, previous_present))
        self.addCleanup(lambda: _restore_env_var(key_missing, previous_missing))

        dbe.write_dot_env({key_present: "yes"})
        config = self._build_config(
            run_mode=ExternalAgentRunMode.app_server,
            command_path="definitely_not_a_codex_executable",
            env_vars=[key_present, key_missing],
        )
        status = build_external_agent_preflight_status(dbe, config)

        self.assertEqual(status.envVars.present, [key_present])
        self.assertEqual(status.envVars.missing, [key_missing])

    def test_server_run_mode_marked_unsupported(self) -> None:
        tmp = self._temp_cwd()
        dbe = DBE(tmp / "setta_files")
        config = self._build_config(run_mode=ExternalAgentRunMode.server)
        status = build_external_agent_preflight_status(dbe, config)

        self.assertFalse(status.supported)
        self.assertFalse(status.available)
        self.assertTrue(any("Run mode" in issue for issue in status.issues))
        self.assertTrue(any("baseUrl is required" in issue for issue in status.issues))

    def test_opencode_server_run_mode_supported(self) -> None:
        tmp = self._temp_cwd()
        dbe = DBE(tmp / "setta_files")
        config = self._build_config(
            tool_type=ExternalAgentToolType.opencode,
            run_mode=ExternalAgentRunMode.server,
        )
        config.baseUrl = "http://localhost:4096"
        status = build_external_agent_preflight_status(dbe, config)

        self.assertTrue(status.supported)
        self.assertEqual(status.baseUrl, "http://localhost:4096")
        self.assertFalse(any("Run mode" in issue for issue in status.issues))

    def test_missing_codex_cli_reports_issue(self) -> None:
        tmp = self._temp_cwd()
        dbe = DBE(tmp / "setta_files")
        config = self._build_config(
            run_mode=ExternalAgentRunMode.app_server,
            command_path="definitely_not_a_codex_executable",
        )
        status = build_external_agent_preflight_status(dbe, config)

        self.assertTrue(
            any("codex CLI not found" in issue for issue in status.issues)
        )

    def test_check_node_uses_command_path(self) -> None:
        if os.name == "nt":
            self.skipTest("Shell script node stub is not supported on Windows")
        tmp_dir = TemporaryDirectory()
        self.addCleanup(tmp_dir.cleanup)
        script_path = Path(tmp_dir.name) / "node"
        script_path.write_text("#!/bin/sh\necho \"v18.0.0\"\n", encoding="utf-8")
        script_path.chmod(0o755)

        node_path, node_version, node_issue = preflight._check_node(str(script_path))

        self.assertIsNone(node_issue)
        self.assertEqual(node_path, str(script_path))
        self.assertEqual(node_version, "v18.0.0")

    def test_sdk_version_reflects_sidecar_install(self) -> None:
        tmp = self._temp_cwd()
        dbe = DBE(tmp / "setta_files")
        config = self._build_config(
            tool_type=ExternalAgentToolType.opencode,
            run_mode=ExternalAgentRunMode.sdk,
        )
        status = build_external_agent_preflight_status(dbe, config)

        package_json = (
            preflight._SIDECAR_NODE_MODULES
            / "@opencode-ai"
            / "sdk"
            / "package.json"
        )
        if not package_json.exists():
            self.assertIsNone(status.sdkVersion)
            self.assertTrue(
                any(
                    "@opencode-ai/sdk is not installed" in issue
                    for issue in status.issues
                )
            )
            return

        try:
            payload = json.loads(package_json.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            self.assertIsNone(status.sdkVersion)
            return

        version = payload.get("version")
        if isinstance(version, str) and version.strip():
            self.assertEqual(status.sdkVersion, version.strip())
        else:
            self.assertIsNone(status.sdkVersion)
