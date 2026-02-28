import json
import os
import shutil
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
from setta.llm.api_keys import llm_api_keys_path, write_managed_api_keys
from setta.plugins.models import PluginRegisteredExternalAgentAdapter
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
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

    def test_env_var_status_reads_process_env(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            key_present = "SETTA_TEST_ENV_PRESENT"
            key_missing = "SETTA_TEST_ENV_MISSING"

            previous_present = os.environ.pop(key_present, None)
            previous_missing = os.environ.pop(key_missing, None)
            try:
                os.environ[key_present] = "yes"
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

    def test_env_var_status_treats_whitespace_process_values_as_missing(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            key_name = "SETTA_TEST_ENV_WHITESPACE"

            previous_value = os.environ.pop(key_name, None)
            try:
                os.environ[key_name] = "   "
                config = self._build_config(
                    run_mode=ExternalAgentRunMode.app_server,
                    command_path="definitely_not_a_codex_executable",
                    env_vars=[key_name],
                )
                status = build_external_agent_preflight_status(dbe, config)

                assert status.envVars.present == []
                assert status.envVars.missing == [key_name]
            finally:
                _restore_env_var(key_name, previous_value)

    def test_env_var_status_ignores_dot_env_without_managed_or_process_value(self) -> (
        None
    ):
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

                assert status.envVars.present == []
                assert status.envVars.missing == [key_missing, key_present]
            finally:
                _restore_env_var(key_present, previous_present)
                _restore_env_var(key_missing, previous_missing)

    def test_env_var_status_reads_managed_api_keys(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            key_present = "SETTA_TEST_ENV_PRESENT"
            key_missing = "SETTA_TEST_ENV_MISSING"

            previous_present = os.environ.pop(key_present, None)
            previous_missing = os.environ.pop(key_missing, None)
            try:
                write_managed_api_keys(dbe, {key_present: "yes"})
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

    def test_env_var_status_reports_corrupt_managed_api_key_store(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            key_missing = "SETTA_TEST_ENV_MISSING"
            dbe.write_json(llm_api_keys_path(dbe), [])
            config = self._build_config(
                run_mode=ExternalAgentRunMode.app_server,
                command_path="definitely_not_a_codex_executable",
                env_vars=[key_missing],
            )

            status = build_external_agent_preflight_status(dbe, config)

            assert status.envVars.present == []
            assert status.envVars.missing == [key_missing]
            assert any(
                "Managed LLM API key store is corrupt" in issue
                for issue in status.issues
            )

    def test_env_var_status_reports_corrupt_managed_api_key_store_malformed_json(
        self,
    ) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            key_missing = "SETTA_TEST_ENV_MISSING"
            path = llm_api_keys_path(dbe)
            path.parent.mkdir(parents=True, exist_ok=True)
            # Preflight must treat malformed JSON text as recoverable corruption.
            path.write_text('{"OPENAI_API_KEY":"secret"', encoding="utf-8")
            config = self._build_config(
                run_mode=ExternalAgentRunMode.app_server,
                command_path="definitely_not_a_codex_executable",
                env_vars=[key_missing],
            )

            status = build_external_agent_preflight_status(dbe, config)

            assert status.envVars.present == []
            assert status.envVars.missing == [key_missing]
            assert any(
                "Managed LLM API key store is corrupt" in issue
                for issue in status.issues
            )

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

    def test_run_cli_os_error_returns_issue(self) -> None:
        with mock.patch(
            "setta.agentic.external_agent_preflight.subprocess.run"
        ) as mocked_run:
            mocked_run.side_effect = PermissionError(
                13,
                "Permission denied",
                "/tmp/nonexec-codex",
            )
            result, issue = preflight._run_cli(["/tmp/nonexec-codex", "--version"])

            assert result is None
            assert issue is not None
            if issue is not None:
                assert "Failed to run /tmp/nonexec-codex --version" in issue
                assert "Permission denied" in issue

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
            assert status.issues == [
                "Plugin external agent adapter is not registered: acme-plugin:missing"
            ]

    def test_plugin_tool_missing_adapter_id_reports_one_primary_issue(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            config = ExternalAgentConfig(
                name="Missing plugin adapter id",
                toolType=ExternalAgentToolType.plugin,
                pluginAdapterId=None,
                runMode=ExternalAgentRunMode.sdk,
            )

            status = build_external_agent_preflight_status(dbe, config)

            assert not status.supported
            assert not status.available
            assert status.issues == [
                "pluginAdapterId is required for plugin external agents"
            ]

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

    def test_plugin_tool_resolves_relative_command_with_custom_working_dir(
        self,
    ) -> None:
        if os.name == "nt":
            pytest.skip("Shell script command fixture is not supported on Windows")
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            command_root = tmp / "plugin-adapter-root"
            command_root.mkdir(parents=True, exist_ok=True)
            command_path = command_root / "bin" / "fixture-adapter"
            command_path.parent.mkdir(parents=True, exist_ok=True)
            command_path.write_text("#!/bin/sh\necho adapter\n", encoding="utf-8")
            command_path.chmod(0o755)

            plugin_adapter = PluginRegisteredExternalAgentAdapter(
                adapterId="acme-plugin:relative-command",
                pluginId="acme-plugin",
                name="Relative Command Adapter",
                runModes=["sdk"],
                command="missing-default-command",
                args=[],
                envVarWhitelist=[],
                defaultModel=None,
            )
            config = ExternalAgentConfig(
                name="Relative Command Adapter Config",
                toolType=ExternalAgentToolType.plugin,
                pluginAdapterId=plugin_adapter.adapterId,
                runMode=ExternalAgentRunMode.sdk,
                commandPath="./bin/fixture-adapter",
                workingDirStrategy=ExternalAgentWorkingDirStrategy.custom,
                workingDir=str(command_root),
            )

            status = build_external_agent_preflight_status(
                dbe,
                config,
                plugin_external_agent_adapters=[plugin_adapter],
            )

            assert status.supported
            assert status.available
            assert not any("command not found" in issue for issue in status.issues)

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

    def test_plugin_tool_rejects_relative_command_for_temp_dir_strategy(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            plugin_adapter = PluginRegisteredExternalAgentAdapter(
                adapterId="acme-plugin:temp-relative",
                pluginId="acme-plugin",
                name="Temp Relative Adapter",
                runModes=["sdk"],
                command="python",
                args=[],
                envVarWhitelist=[],
                defaultModel=None,
            )
            config = ExternalAgentConfig(
                name="Temp Relative Config",
                toolType=ExternalAgentToolType.plugin,
                pluginAdapterId=plugin_adapter.adapterId,
                runMode=ExternalAgentRunMode.sdk,
                commandPath="./bin/adapter",
                workingDirStrategy=ExternalAgentWorkingDirStrategy.temp_dir,
            )

            status = build_external_agent_preflight_status(
                dbe,
                config,
                plugin_external_agent_adapters=[plugin_adapter],
            )

            assert status.supported
            assert not status.available
            assert any(
                "relative command requires an absolute path" in issue
                for issue in status.issues
            )

    def test_plugin_tool_non_path_command_prefers_path_resolution_over_local_file(
        self,
    ) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            command_name = Path(sys.executable).name
            resolved_command = shutil.which(command_name)
            if resolved_command is None:
                raise AssertionError(
                    f"Expected PATH to resolve interpreter command {command_name!r}"
                )
            local_shadow = tmp / command_name
            local_shadow.write_text("not executable", encoding="utf-8")
            if os.name != "nt":
                local_shadow.chmod(0o644)
            plugin_adapter = PluginRegisteredExternalAgentAdapter(
                adapterId="acme-plugin:path-command",
                pluginId="acme-plugin",
                name="Path Command Adapter",
                runModes=["sdk"],
                command=command_name,
                args=[],
                envVarWhitelist=[],
                defaultModel=None,
            )
            config = ExternalAgentConfig(
                name="Path Command Config",
                toolType=ExternalAgentToolType.plugin,
                pluginAdapterId=plugin_adapter.adapterId,
                runMode=ExternalAgentRunMode.sdk,
                commandPath=command_name,
            )

            status = build_external_agent_preflight_status(
                dbe,
                config,
                plugin_external_agent_adapters=[plugin_adapter],
            )

            assert status.supported
            assert status.available
            assert status.issues == []

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

    def test_plugin_tool_rejects_non_executable_file_command(self) -> None:
        if os.name == "nt":
            pytest.skip("Executable bit semantics differ on Windows.")
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            command_path = tmp / "adapter-command"
            command_path.write_text("#!/bin/sh\necho ok\n", encoding="utf-8")
            command_path.chmod(0o644)
            plugin_adapter = PluginRegisteredExternalAgentAdapter(
                adapterId="acme-plugin:non-executable",
                pluginId="acme-plugin",
                name="Non Executable Adapter",
                runModes=["sdk"],
                command=str(command_path),
                args=[],
                envVarWhitelist=[],
                defaultModel=None,
            )
            config = ExternalAgentConfig(
                name="Non Executable Adapter Config",
                toolType=ExternalAgentToolType.plugin,
                pluginAdapterId=plugin_adapter.adapterId,
                runMode=ExternalAgentRunMode.sdk,
                commandPath=str(command_path),
            )

            status = build_external_agent_preflight_status(
                dbe,
                config,
                plugin_external_agent_adapters=[plugin_adapter],
            )

            assert status.supported
            assert not status.available
            assert status.issues == [
                f"Plugin external agent command is not executable ({command_path})"
            ]

    def test_preflight_cache_prunes_expired_entries(self) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            preflight._PREFLIGHT_CACHE.clear()
            try:
                stale_config = self._build_config(
                    run_mode=ExternalAgentRunMode.app_server,
                    command_path="definitely_not_a_codex_executable",
                )
                fresh_config = self._build_config(
                    run_mode=ExternalAgentRunMode.app_server,
                    command_path="definitely_not_a_codex_executable",
                )

                stale_status = build_external_agent_preflight_status(dbe, stale_config)
                build_external_agent_preflight_status(dbe, fresh_config)
                stale_key = str(stale_config.id)
                fresh_key = str(fresh_config.id)
                stale_entry = preflight._PREFLIGHT_CACHE[stale_key]
                preflight._PREFLIGHT_CACHE[stale_key] = preflight._PreflightCacheEntry(
                    status=stale_status,
                    config_fingerprint=stale_entry.config_fingerprint,
                    env_fingerprint=stale_entry.env_fingerprint,
                    plugin_adapter_fingerprint=stale_entry.plugin_adapter_fingerprint,
                    created_at=stale_entry.created_at
                    - (preflight._PREFLIGHT_CACHE_TTL_SECONDS + 1.0),
                )
                assert stale_key in preflight._PREFLIGHT_CACHE
                assert fresh_key in preflight._PREFLIGHT_CACHE

                build_external_agent_preflight_status(dbe, fresh_config)

                assert stale_key not in preflight._PREFLIGHT_CACHE
                assert fresh_key in preflight._PREFLIGHT_CACHE
            finally:
                preflight._PREFLIGHT_CACHE.clear()

    def test_preflight_cache_respects_max_entries(self, monkeypatch) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            preflight._PREFLIGHT_CACHE.clear()
            monkeypatch.setattr(preflight, "_PREFLIGHT_CACHE_MAX_ENTRIES", 2)
            try:
                first = self._build_config(
                    run_mode=ExternalAgentRunMode.app_server,
                    command_path="definitely_not_a_codex_executable",
                )
                second = self._build_config(
                    run_mode=ExternalAgentRunMode.app_server,
                    command_path="definitely_not_a_codex_executable",
                )
                third = self._build_config(
                    run_mode=ExternalAgentRunMode.app_server,
                    command_path="definitely_not_a_codex_executable",
                )

                build_external_agent_preflight_status(dbe, first)
                build_external_agent_preflight_status(dbe, second)
                build_external_agent_preflight_status(dbe, third)

                assert len(preflight._PREFLIGHT_CACHE) <= 2
                assert str(first.id) not in preflight._PREFLIGHT_CACHE
                assert str(second.id) in preflight._PREFLIGHT_CACHE
                assert str(third.id) in preflight._PREFLIGHT_CACHE
            finally:
                preflight._PREFLIGHT_CACHE.clear()

    def test_store_preflight_cache_prunes_once_per_write(self, monkeypatch) -> None:
        with _temp_cwd() as tmp:
            dbe = DBE(tmp / "setta_files")
            preflight._PREFLIGHT_CACHE.clear()
            try:
                config = self._build_config(
                    run_mode=ExternalAgentRunMode.app_server,
                    command_path="definitely_not_a_codex_executable",
                )
                status = build_external_agent_preflight_status(dbe, config)
                prune_calls = 0
                original_prune = preflight._prune_preflight_cache

                def _counting_prune(*, now: float) -> None:
                    nonlocal prune_calls
                    prune_calls += 1
                    original_prune(now=now)

                monkeypatch.setattr(
                    preflight,
                    "_prune_preflight_cache",
                    _counting_prune,
                )
                preflight._store_preflight_cache(
                    config,
                    preflight._EnvStatusResult(status=status.envVars),
                    status,
                    plugin_adapter_fingerprint=None,
                )
                assert prune_calls == 1
            finally:
                preflight._PREFLIGHT_CACHE.clear()
