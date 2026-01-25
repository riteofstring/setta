import importlib.metadata
import json
import os
import re
import shutil
import subprocess
from pathlib import Path

from setta.agentic.node_runtime import resolve_node_command
from setta.database.db_objs import DBE
from setta.types.external_agents import (
    ExternalAgentConfig,
    ExternalAgentEnvVarStatus,
    ExternalAgentPreflightStatus,
    ExternalAgentRunMode,
    ExternalAgentToolType,
    ExternalAgentWorkingDirStrategy,
)
from setta.utils.constants import CWD

_NODE_VERSION_RE = re.compile(r"v?(\d+)\.(\d+)\.(\d+)")
_SIDECAR_ROOT = Path(__file__).resolve().parent / "external_adapters" / "sidecars"
_SIDECAR_NODE_MODULES = _SIDECAR_ROOT / "node_modules"

_SDK_PACKAGE_BY_TOOL = {
    ExternalAgentToolType.opencode: "@opencode-ai/sdk",
}

_NODE_MIN_MAJOR: dict[ExternalAgentToolType, int] = {}


def build_external_agent_preflight_status(
    dbe: DBE, config: ExternalAgentConfig
) -> ExternalAgentPreflightStatus:
    issues: list[str] = []
    supported = _is_run_mode_supported(config.toolType, config.runMode)
    env_status = _build_env_status(dbe, config.envVarWhitelist)
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

            if (
                config.runMode == ExternalAgentRunMode.sdk
                and not config.baseUrl
            ):
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

    working_dir, working_dir_issue = _resolve_working_dir(config)
    if working_dir_issue:
        issues.append(working_dir_issue)

    base_url_issue = _check_base_url(config)
    if base_url_issue:
        issues.append(base_url_issue)

    if not supported:
        issues.append(
            f"Run mode {config.runMode.value} not supported for {config.toolType.value}"
        )

    available = supported and len(issues) == 0
    return ExternalAgentPreflightStatus(
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


def _is_run_mode_supported(
    tool_type: ExternalAgentToolType, run_mode: ExternalAgentRunMode
) -> bool:
    if tool_type == ExternalAgentToolType.codex:
        return run_mode == ExternalAgentRunMode.app_server
    if tool_type == ExternalAgentToolType.claude_code:
        return run_mode == ExternalAgentRunMode.sdk
    if tool_type == ExternalAgentToolType.opencode:
        return run_mode in (ExternalAgentRunMode.sdk, ExternalAgentRunMode.server)
    return False


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
    result = subprocess.run(
        [node_path, "--version"],
        capture_output=True,
        text=True,
        cwd=str(CWD),
    )
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
    result = subprocess.run(
        [cli_path, "--version"],
        capture_output=True,
        text=True,
        cwd=str(CWD),
    )
    raw = (result.stdout or result.stderr).strip()
    if result.returncode != 0 or not raw:
        return None, "Failed to read codex CLI version"
    if not _codex_app_server_available(cli_path):
        return raw, "codex app-server subcommand not available"
    return raw, None


def _check_opencode_cli() -> tuple[str | None, str | None]:
    cli_path = shutil.which("opencode")
    if not cli_path:
        return None, "opencode CLI not found (install opencode CLI)"
    result = subprocess.run(
        [cli_path, "--version"],
        capture_output=True,
        text=True,
        cwd=str(CWD),
    )
    raw = (result.stdout or result.stderr).strip()
    if result.returncode != 0 or not raw:
        return None, "Failed to read opencode CLI version"
    return raw, None


def _codex_app_server_available(cli_path: str) -> bool:
    result = subprocess.run(
        [cli_path, "app-server", "--help"],
        capture_output=True,
        text=True,
        cwd=str(CWD),
    )
    return result.returncode == 0


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
        return str(CWD), None
    if strategy == ExternalAgentWorkingDirStrategy.temp_dir:
        return None, None
    if strategy == ExternalAgentWorkingDirStrategy.custom:
        if not config.workingDir:
            return None, "workingDir is required for custom working dir strategy"
        return config.workingDir, None
    return None, None


def _check_base_url(config: ExternalAgentConfig) -> str | None:
    if config.runMode != ExternalAgentRunMode.server:
        return None
    if not config.baseUrl:
        return "baseUrl is required for server run mode"
    return None
