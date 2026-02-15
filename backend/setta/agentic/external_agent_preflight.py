import importlib.metadata
import json
import os
import re
import shutil
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path

from setta.agentic.node_runtime import resolve_node_command
from setta.database.db_objs import DBE
from setta.plugins.models import PluginRegisteredExternalAgentAdapter
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentEnvVarStatus,
    ExternalAgentPreflightStatus,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.utils.paths import get_setta_paths

_NODE_VERSION_RE = re.compile(r"v?(\d+)\.(\d+)\.(\d+)")
_SIDECAR_ROOT = Path(__file__).resolve().parent / "external_adapters" / "sidecars"
_SIDECAR_NODE_MODULES = _SIDECAR_ROOT / "node_modules"

_SDK_PACKAGE_BY_TOOL = {
    ExternalAgentToolType.opencode: "@opencode-ai/sdk",
}

_NODE_MIN_MAJOR: dict[ExternalAgentToolType, int] = {}
_PREFLIGHT_CACHE_TTL_SECONDS = 30.0
_DEFAULT_CLI_TIMEOUT_SECONDS = 5.0


@dataclass(frozen=True)
class _PreflightCacheEntry:
    status: ExternalAgentPreflightStatus
    config_fingerprint: str
    env_fingerprint: tuple[tuple[str, ...], tuple[str, ...]]
    plugin_adapter_fingerprint: str | None
    created_at: float


_PREFLIGHT_CACHE: dict[str, _PreflightCacheEntry] = {}


def build_external_agent_preflight_status(
    dbe: DBE,
    config: ExternalAgentConfig,
    plugin_external_agent_adapters: (
        list[PluginRegisteredExternalAgentAdapter] | None
    ) = None,
) -> ExternalAgentPreflightStatus:
    plugin_adapter_by_id = _build_plugin_adapter_map(plugin_external_agent_adapters)
    plugin_adapter = _resolve_plugin_adapter(config, plugin_adapter_by_id)
    env_status = _build_env_status(
        dbe,
        _build_effective_env_var_whitelist(config, plugin_adapter),
    )
    plugin_adapter_fingerprint = _build_plugin_adapter_fingerprint(
        config,
        plugin_adapter,
    )
    cached = _load_cached_preflight(
        config,
        env_status,
        plugin_adapter_fingerprint=plugin_adapter_fingerprint,
    )
    if cached is not None:
        return cached

    issues: list[str] = []
    supported = _is_run_mode_supported(
        config.toolType,
        config.runMode,
        plugin_adapter=plugin_adapter,
    )
    plugin_adapter_resolution_issue: str | None = None
    if config.toolType == ExternalAgentToolType.plugin:
        if config.pluginAdapterId is None or config.pluginAdapterId.strip() == "":
            plugin_adapter_resolution_issue = (
                "pluginAdapterId is required for plugin external agents"
            )
        elif plugin_adapter is None:
            plugin_adapter_resolution_issue = (
                "Plugin external agent adapter is not registered: "
                f"{config.pluginAdapterId}"
            )
        if plugin_adapter_resolution_issue is not None:
            issues.append(plugin_adapter_resolution_issue)
    if env_status.missing:
        issues.append(f"Missing env vars: {', '.join(env_status.missing)}")

    node_path = None
    node_version = None
    sdk_version = None
    cli_version = None
    if config.runMode in (ExternalAgentRunMode.sdk, ExternalAgentRunMode.server):
        if config.toolType == ExternalAgentToolType.claude_code:
            if config.runMode == ExternalAgentRunMode.sdk:
                sdk_version, sdk_issue = _check_claude_python_sdk()
                if sdk_issue:
                    issues.append(sdk_issue)
        elif config.toolType == ExternalAgentToolType.opencode:
            node_path, node_version, node_issue = _check_node(config.commandPath)
            if node_issue:
                issues.append(node_issue)
            node_version_issue = _check_node_version_requirement(
                config.toolType, node_version
            )
            if node_version_issue:
                issues.append(node_version_issue)

            sdk_version, sdk_issue = _check_sdk_version(config.toolType)
            if sdk_issue:
                issues.append(sdk_issue)

            if config.runMode == ExternalAgentRunMode.sdk and not config.baseUrl:
                cli_version, cli_issue = _check_opencode_cli()
                if cli_issue:
                    issues.append(cli_issue)
    elif (
        config.runMode == ExternalAgentRunMode.app_server
        and config.toolType == ExternalAgentToolType.codex
    ):
        cli_version, cli_issue = _check_codex_cli(config.commandPath)
        if cli_issue:
            issues.append(cli_issue)

    if (
        config.toolType == ExternalAgentToolType.plugin
        and plugin_adapter_resolution_issue is None
    ):
        command_issue = _check_plugin_command(
            config.commandPath,
            plugin_adapter=plugin_adapter,
        )
        if command_issue:
            issues.append(command_issue)

    working_dir, working_dir_issue = _resolve_working_dir(config)
    if working_dir_issue:
        issues.append(working_dir_issue)

    base_url_issue = _check_base_url(config)
    if base_url_issue:
        issues.append(base_url_issue)

    if not supported and plugin_adapter_resolution_issue is None:
        issues.append(
            f"Run mode {config.runMode.value} not supported for {config.toolType.value}"
        )

    available = supported and len(issues) == 0
    status = ExternalAgentPreflightStatus(
        configId=config.id,
        name=config.name,
        toolType=config.toolType,
        runMode=config.runMode,
        supported=supported,
        available=available,
        issues=issues,
        nodePath=node_path,
        nodeVersion=node_version,
        sdkVersion=sdk_version,
        cliVersion=cli_version,
        baseUrl=config.baseUrl,
        workingDir=working_dir,
        envVars=env_status,
    )
    _store_preflight_cache(
        config,
        env_status,
        status,
        plugin_adapter_fingerprint=plugin_adapter_fingerprint,
    )
    return status


def _is_run_mode_supported(
    tool_type: ExternalAgentToolType,
    run_mode: ExternalAgentRunMode,
    *,
    plugin_adapter: PluginRegisteredExternalAgentAdapter | None,
) -> bool:
    if tool_type == ExternalAgentToolType.codex:
        return run_mode == ExternalAgentRunMode.app_server
    if tool_type == ExternalAgentToolType.claude_code:
        return run_mode == ExternalAgentRunMode.sdk
    if tool_type == ExternalAgentToolType.opencode:
        return run_mode in (ExternalAgentRunMode.sdk, ExternalAgentRunMode.server)
    if tool_type == ExternalAgentToolType.plugin:
        if plugin_adapter is None:
            return False
        return run_mode.value in plugin_adapter.runModes
    return False


def _build_plugin_adapter_map(
    adapters: list[PluginRegisteredExternalAgentAdapter] | None,
) -> dict[str, PluginRegisteredExternalAgentAdapter]:
    if adapters is None:
        return {}
    by_id: dict[str, PluginRegisteredExternalAgentAdapter] = {}
    for adapter in adapters:
        by_id[adapter.adapterId] = adapter
    return by_id


def _resolve_plugin_adapter(
    config: ExternalAgentConfig,
    plugin_adapter_by_id: dict[str, PluginRegisteredExternalAgentAdapter],
) -> PluginRegisteredExternalAgentAdapter | None:
    if config.toolType != ExternalAgentToolType.plugin:
        return None
    plugin_adapter_id = (config.pluginAdapterId or "").strip()
    if plugin_adapter_id == "":
        return None
    return plugin_adapter_by_id.get(plugin_adapter_id)


def _build_effective_env_var_whitelist(
    config: ExternalAgentConfig,
    plugin_adapter: PluginRegisteredExternalAgentAdapter | None,
) -> list[str]:
    names: list[str] = list(config.envVarWhitelist)
    if plugin_adapter is not None:
        names.extend(plugin_adapter.envVarWhitelist)
    normalized = sorted({name.strip() for name in names if name.strip()})
    return normalized


def _build_plugin_adapter_fingerprint(
    config: ExternalAgentConfig,
    plugin_adapter: PluginRegisteredExternalAgentAdapter | None,
) -> str | None:
    if config.toolType != ExternalAgentToolType.plugin:
        return None
    if plugin_adapter is None:
        return f"missing:{config.pluginAdapterId or ''}"
    payload = plugin_adapter.model_dump(mode="json")
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def _build_env_status(dbe: DBE, whitelist: list[str]) -> ExternalAgentEnvVarStatus:
    normalized = [name.strip() for name in whitelist if name.strip()]
    if not normalized:
        return ExternalAgentEnvVarStatus()
    dot_env = dbe.read_dot_env()
    present = sorted(
        name for name in normalized if name in os.environ or name in dot_env
    )
    missing = sorted(
        name for name in normalized if name not in os.environ and name not in dot_env
    )
    return ExternalAgentEnvVarStatus(present=present, missing=missing)


def _check_node(command_path: str | None) -> tuple[str | None, str | None, str | None]:
    node_command = resolve_node_command(command_path)
    if Path(node_command).is_file():
        node_path = node_command
    else:
        node_path = shutil.which(node_command)
    if not node_path:
        return None, None, f"Node executable not found ({node_command})"
    result, issue = _run_cli([node_path, "--version"])
    if issue:
        return node_path, None, issue
    if result is None:
        return node_path, None, "Failed to read Node version"
    raw = (result.stdout or result.stderr).strip()
    if result.returncode != 0 or not raw:
        return node_path, None, "Failed to read Node version"
    return node_path, raw, None


def _check_node_version_requirement(
    tool_type: ExternalAgentToolType, node_version: str | None
) -> str | None:
    min_major = _NODE_MIN_MAJOR.get(tool_type)
    if min_major is None or node_version is None:
        return None
    match = _NODE_VERSION_RE.search(node_version)
    if not match:
        return f"Unable to parse Node version '{node_version}'"
    major = int(match.group(1))
    if major < min_major:
        return f"{tool_type.value} SDK requires Node {min_major}+"
    return None


def _check_codex_cli(
    command_path: str | None,
) -> tuple[str | None, str | None]:
    command = command_path or "codex"
    if Path(command).is_file():
        cli_path = command
    else:
        cli_path = shutil.which(command)
    if not cli_path:
        return None, f"codex CLI not found ({command})"
    result, issue = _run_cli([cli_path, "--version"])
    if issue:
        return None, issue
    if result is None:
        return None, "Failed to read codex CLI version"
    raw = (result.stdout or result.stderr).strip()
    if result.returncode != 0 or not raw:
        return None, "Failed to read codex CLI version"
    available, availability_issue = _codex_app_server_available(cli_path)
    if availability_issue:
        return raw, availability_issue
    if not available:
        return raw, "codex app-server subcommand not available"
    return raw, None


def _check_opencode_cli() -> tuple[str | None, str | None]:
    cli_path = shutil.which("opencode")
    if not cli_path:
        return None, "opencode CLI not found (install opencode CLI)"
    result, issue = _run_cli([cli_path, "--version"])
    if issue:
        return None, issue
    if result is None:
        return None, "Failed to read opencode CLI version"
    raw = (result.stdout or result.stderr).strip()
    if result.returncode != 0 or not raw:
        return None, "Failed to read opencode CLI version"
    return raw, None


def _check_plugin_command(
    command_path: str | None,
    *,
    plugin_adapter: PluginRegisteredExternalAgentAdapter | None,
) -> str | None:
    if plugin_adapter is None:
        return "Plugin external agent adapter is not registered"
    command_override = (command_path or "").strip()
    command = command_override or plugin_adapter.command.strip()
    if command == "":
        return "Plugin external agent command is empty"
    command_path = Path(command)
    if command_path.is_file():
        if os.access(command_path, os.X_OK):
            return None
        return f"Plugin external agent command is not executable ({command})"
    if shutil.which(command):
        return None
    return f"Plugin external agent command not found ({command})"


def _codex_app_server_available(cli_path: str) -> tuple[bool, str | None]:
    result, issue = _run_cli([cli_path, "app-server", "--help"])
    if issue:
        return False, issue
    if result is None:
        return False, "Failed to query codex app-server availability"
    return result.returncode == 0, None


def _check_sdk_version(
    tool_type: ExternalAgentToolType,
) -> tuple[str | None, str | None]:
    package_name = _SDK_PACKAGE_BY_TOOL.get(tool_type)
    if package_name is None:
        return None, None
    package_json = _SIDECAR_NODE_MODULES / package_name / "package.json"
    if not package_json.exists():
        return (
            None,
            f"{package_name} is not installed (run pnpm install in {_SIDECAR_ROOT})",
        )
    try:
        payload = json.loads(package_json.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        return None, f"Failed to read {package_name} version: {exc}"
    version = payload.get("version")
    if isinstance(version, str) and version.strip():
        return version.strip(), None
    return None, f"{package_name} did not report a version"


def _run_cli(
    command: list[str],
    *,
    timeout: float = _DEFAULT_CLI_TIMEOUT_SECONDS,
) -> tuple[subprocess.CompletedProcess[str] | None, str | None]:
    try:
        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            cwd=str(get_setta_paths().workspace_root),
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return None, f"Timed out running {' '.join(command)}"
    return result, None


def _build_config_fingerprint(config: ExternalAgentConfig) -> str:
    payload = config.model_dump(mode="json")
    return json.dumps(payload, sort_keys=True, separators=(",", ":"))


def _build_env_fingerprint(
    env_status: ExternalAgentEnvVarStatus,
) -> tuple[tuple[str, ...], tuple[str, ...]]:
    return (tuple(env_status.present), tuple(env_status.missing))


def _load_cached_preflight(
    config: ExternalAgentConfig,
    env_status: ExternalAgentEnvVarStatus,
    *,
    plugin_adapter_fingerprint: str | None,
) -> ExternalAgentPreflightStatus | None:
    cache_key = str(config.id)
    entry = _PREFLIGHT_CACHE.get(cache_key)
    if entry is None:
        return None
    if time.monotonic() - entry.created_at > _PREFLIGHT_CACHE_TTL_SECONDS:
        return None
    if entry.config_fingerprint != _build_config_fingerprint(config):
        return None
    if entry.env_fingerprint != _build_env_fingerprint(env_status):
        return None
    if entry.plugin_adapter_fingerprint != plugin_adapter_fingerprint:
        return None
    return entry.status


def _store_preflight_cache(
    config: ExternalAgentConfig,
    env_status: ExternalAgentEnvVarStatus,
    status: ExternalAgentPreflightStatus,
    *,
    plugin_adapter_fingerprint: str | None,
) -> None:
    cache_key = str(config.id)
    _PREFLIGHT_CACHE[cache_key] = _PreflightCacheEntry(
        status=status,
        config_fingerprint=_build_config_fingerprint(config),
        env_fingerprint=_build_env_fingerprint(env_status),
        plugin_adapter_fingerprint=plugin_adapter_fingerprint,
        created_at=time.monotonic(),
    )


def _check_claude_python_sdk() -> tuple[str | None, str | None]:
    try:
        version = importlib.metadata.version("claude-agent-sdk")
    except importlib.metadata.PackageNotFoundError:
        return None, "claude-agent-sdk is not installed (pip install claude-agent-sdk)"
    if isinstance(version, str) and version.strip():
        return version.strip(), None
    return None, "claude-agent-sdk did not report a version"


def _resolve_working_dir(
    config: ExternalAgentConfig,
) -> tuple[str | None, str | None]:
    strategy = config.workingDirStrategy
    if strategy == ExternalAgentWorkingDirStrategy.project_root:
        return str(get_setta_paths().workspace_root), None
    if strategy == ExternalAgentWorkingDirStrategy.temp_dir:
        return None, None
    if strategy == ExternalAgentWorkingDirStrategy.custom:
        if not config.workingDir:
            return None, "workingDir is required for custom working dir strategy"
        return config.workingDir, None
    return None, None


def _check_base_url(config: ExternalAgentConfig) -> str | None:
    if config.toolType == ExternalAgentToolType.plugin:
        return None
    if config.runMode != ExternalAgentRunMode.server:
        return None
    if not config.baseUrl:
        return "baseUrl is required for server run mode"
    return None
