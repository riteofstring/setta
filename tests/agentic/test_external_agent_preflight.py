import json
import os
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest import mock

import pytest

import setta.agentic.external_agent_preflight as preflight
from setta.agentic.external_agent_preflight import (
    build_external_agent_preflight_status,
)
from setta.database.db_objs import DBE
from setta.plugins.models import PluginRegisteredExternalAgentAdapter
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


@contextmanager
def _temp_cwd() -> Path:
    with TemporaryDirectory() as tmp_dir:
        previous = os.getcwd()
        os.chdir(tmp_dir)
        try:
            yield Path(tmp_dir)
        finally:
            os.chdir(previous)


class TestExternalAgentPreflight:

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
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            key_present = "SETTA_TEST_ENV_PRESENT"
            key_missing = "SETTA_TEST_ENV_MISSING"

            previous_present = os.environ.pop(key_present, None)
            previous_missing = os.environ.pop(key_missing, None)
            try:
                dbe.write_dot_env({key_present: "yes"})
                config = self._build_config(
                    run_mode=ExternalAgentRunMode.app_server,
                    command_path="definitely_not_a_codex_executable",
                    env_vars=[key_present, key_missing],
                )
                status = build_external_agent_preflight_status(dbe, config)

                assert status.envVars.present == [key_present]
                assert status.envVars.missing == [key_missing]
            finally:
                _restore_env_var(key_present, previous_present)
                _restore_env_var(key_missing, previous_missing)

    def test_server_run_mode_marked_unsupported(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            config = self._build_config(run_mode=ExternalAgentRunMode.server)
            status = build_external_agent_preflight_status(dbe, config)

            assert not status.supported
            assert not status.available
            assert any("Run mode" in issue for issue in status.issues)
            assert any("baseUrl is required" in issue for issue in status.issues)

    def test_opencode_server_run_mode_supported(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            config = self._build_config(
                tool_type=ExternalAgentToolType.opencode,
                run_mode=ExternalAgentRunMode.server,
            )
            config.baseUrl = "http://localhost:4096"
            status = build_external_agent_preflight_status(dbe, config)

            assert status.supported
            assert status.baseUrl == "http://localhost:4096"
            assert not any("Run mode" in issue for issue in status.issues)

    def test_missing_codex_cli_reports_issue(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            config = self._build_config(
                run_mode=ExternalAgentRunMode.app_server,
                command_path="definitely_not_a_codex_executable",
            )
            status = build_external_agent_preflight_status(dbe, config)

            assert any("codex CLI not found" in issue for issue in status.issues)

    def test_check_node_uses_command_path(self) -> None:
        if os.name == "nt":
            pytest.skip("Shell script node stub is not supported on Windows")
        with TemporaryDirectory() as tmp_dir:
            script_path = Path(tmp_dir) / "node"
            script_path.write_text("#!/bin/sh\necho \"v18.0.0\"\n", encoding="utf-8")
            script_path.chmod(0o755)

            node_path, node_version, node_issue = preflight._check_node(
                str(script_path)
            )

            assert node_issue is None
            assert node_path == str(script_path)
            assert node_version == "v18.0.0"

    def test_sdk_version_reflects_sidecar_install(self) -> None:
        with _temp_cwd() as tmp:
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
                assert status.sdkVersion is None
                assert any(
                    "@opencode-ai/sdk is not installed" in issue
                    for issue in status.issues
                )
                return

            try:
                payload = json.loads(package_json.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                assert status.sdkVersion is None
                return

            version = payload.get("version")
            if isinstance(version, str) and version.strip():
                assert status.sdkVersion == version.strip()
            else:
                assert status.sdkVersion is None

    def test_run_cli_timeout_returns_issue(self) -> None:
        with mock.patch(
            "setta.agentic.external_agent_preflight.subprocess.run"
        ) as mocked_run:
            mocked_run.side_effect = subprocess.TimeoutExpired(
                cmd=["node", "--version"], timeout=5
            )
            result, issue = preflight._run_cli(["node", "--version"])

            assert result is None
            assert issue is not None
            if issue is not None:
                assert "Timed out" in issue

    def test_plugin_tool_supported_with_registered_adapter(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            plugin_adapter = PluginRegisteredExternalAgentAdapter(
                adapterId="acme-plugin:openhands",
                pluginId="acme-plugin",
                name="OpenHands",
                runModes=["sdk"],
                command="python",
                args=[],
                envVarWhitelist=[],
                defaultModel="openhands-default",
            )
            config = ExternalAgentConfig(
                name="OpenHands Adapter",
                toolType=ExternalAgentToolType.plugin,
                pluginAdapterId=plugin_adapter.adapterId,
                runMode=ExternalAgentRunMode.sdk,
                commandPath="python",
            )

            status = build_external_agent_preflight_status(
                dbe,
                config,
                plugin_external_agent_adapters=[plugin_adapter],
            )

            assert status.supported
            assert status.available
            assert status.issues == []

    def test_plugin_tool_reports_missing_adapter(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            config = ExternalAgentConfig(
                name="Missing plugin adapter",
                toolType=ExternalAgentToolType.plugin,
                pluginAdapterId="acme-plugin:missing",
                runMode=ExternalAgentRunMode.sdk,
            )

            status = build_external_agent_preflight_status(dbe, config)

            assert not status.supported
            assert not status.available
            assert any(
                "Plugin external agent adapter is not registered" in issue
                for issue in status.issues
            )

    def test_plugin_tool_merges_adapter_env_var_whitelist(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            plugin_env_var = "PLUGIN_EXTERNAL_AGENT_TOKEN"
            previous = os.environ.pop(plugin_env_var, None)
            try:
                plugin_adapter = PluginRegisteredExternalAgentAdapter(
                    adapterId="acme-plugin:env",
                    pluginId="acme-plugin",
                    name="Env Adapter",
                    runModes=["sdk"],
                    command="python",
                    args=[],
                    envVarWhitelist=[plugin_env_var],
                    defaultModel=None,
                )
                config = ExternalAgentConfig(
                    name="Env Adapter Config",
                    toolType=ExternalAgentToolType.plugin,
                    pluginAdapterId=plugin_adapter.adapterId,
                    runMode=ExternalAgentRunMode.sdk,
                    commandPath="python",
                )

                status = build_external_agent_preflight_status(
                    dbe,
                    config,
                    plugin_external_agent_adapters=[plugin_adapter],
                )

                assert status.envVars.present == []
                assert status.envVars.missing == [plugin_env_var]
            finally:
                _restore_env_var(plugin_env_var, previous)

    def test_plugin_tool_sdk_preflight_rejects_invalid_command_override(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            plugin_adapter = PluginRegisteredExternalAgentAdapter(
                adapterId="acme-plugin:bad-command",
                pluginId="acme-plugin",
                name="Bad Command Adapter",
                runModes=["sdk"],
                command=sys.executable,
                args=[],
                envVarWhitelist=[],
                defaultModel=None,
            )
            missing_command = "definitely-not-a-command-xyz"
            config = ExternalAgentConfig(
                name="Bad Command Config",
                toolType=ExternalAgentToolType.plugin,
                pluginAdapterId=plugin_adapter.adapterId,
                runMode=ExternalAgentRunMode.sdk,
                commandPath=missing_command,
            )

            status = build_external_agent_preflight_status(
                dbe,
                config,
                plugin_external_agent_adapters=[plugin_adapter],
            )

            assert status.supported
            assert not status.available
            assert any(
                f"Plugin external agent command not found ({missing_command})" in issue
                for issue in status.issues
            )

    def test_plugin_tool_whitespace_command_override_falls_back_to_adapter_command(
        self,
    ) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            plugin_adapter = PluginRegisteredExternalAgentAdapter(
                adapterId="acme-plugin:trimmed-command",
                pluginId="acme-plugin",
                name="Trimmed Command Adapter",
                runModes=["sdk"],
                command=sys.executable,
                args=[],
                envVarWhitelist=[],
                defaultModel=None,
            )
            config = ExternalAgentConfig(
                name="Whitespace Command Config",
                toolType=ExternalAgentToolType.plugin,
                pluginAdapterId=plugin_adapter.adapterId,
                runMode=ExternalAgentRunMode.sdk,
                commandPath="   ",
            )

            status = build_external_agent_preflight_status(
                dbe,
                config,
                plugin_external_agent_adapters=[plugin_adapter],
            )

            assert status.supported
            assert status.available
            assert status.issues == []
