#!/usr/bin/env python3

import argparse
import configparser
import json
import os
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path

DEFAULT_CDP_PORT = 9222
DEFAULT_DISCOVERY_TAGS = {
    "ManagedBy": "terraform",
    "Name": "setta-devbox",
    "Project": "setta",
    "Service": "aws-devbox",
}
DEFAULT_REGION = "us-east-1"
DEFAULT_REMOTE_HOST = "127.0.0.1"
DEFAULT_REMOTE_SHELL_COMMAND = (
    'sudo -iu ubuntu bash -lc "'
    "if ! tmux has-session -t setta 2>/dev/null; then "
    'tmux new-session -d -s setta -n shell; '
    "fi; "
    "tmux set-option -t setta allow-rename off >/dev/null 2>&1 || true; "
    "tmux rename-window -t setta:0 shell >/dev/null 2>&1 || true; "
    "tmux select-window -t setta:0 >/dev/null 2>&1 || true; "
    'exec tmux attach-session -t setta"'
)
DEFAULT_SETTA_PORT = 8000
DEFAULT_SSM_WAIT_TIMEOUT_SECONDS = 300
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_TERRAFORM_DIR = REPO_ROOT / "infra" / "aws-devbox" / "terraform"


@dataclass(frozen=True)
class TerraformOutputs:
    region: str | None
    instance_id: str | None
    instance_name: str | None
    repo_checkout_path: str | None
    discovery_tags: dict[str, str]
    default_ports: dict[str, int]


def parse_terraform_outputs(raw_payload: str) -> TerraformOutputs:
    payload = json.loads(raw_payload)
    if not isinstance(payload, dict):
        raise SystemExit("terraform output did not return a top-level object")

    discovery_tags = extract_string_map(payload, "discovery_tags")
    default_ports_raw = extract_map(payload, "default_ports")
    default_ports: dict[str, int] = {}
    for key, value in default_ports_raw.items():
        if isinstance(value, int):
            default_ports[key] = value

    return TerraformOutputs(
        region=extract_string(payload, "region"),
        instance_id=extract_string(payload, "instance_id"),
        instance_name=extract_string(payload, "instance_name"),
        repo_checkout_path=extract_string(payload, "repo_checkout_path"),
        discovery_tags=discovery_tags,
        default_ports=default_ports,
    )


def extract_output_value(payload: dict[str, object], key: str) -> object | None:
    raw_entry = payload.get(key)
    if not isinstance(raw_entry, dict):
        return None
    return raw_entry.get("value")


def extract_string(payload: dict[str, object], key: str) -> str | None:
    value = extract_output_value(payload, key)
    if isinstance(value, str) and value:
        return value
    return None


def extract_map(payload: dict[str, object], key: str) -> dict[str, object]:
    value = extract_output_value(payload, key)
    if isinstance(value, dict):
        return value
    return {}


def extract_string_map(payload: dict[str, object], key: str) -> dict[str, str]:
    raw_map = extract_map(payload, key)
    parsed: dict[str, str] = {}
    for entry_key, entry_value in raw_map.items():
        if isinstance(entry_key, str) and isinstance(entry_value, str):
            parsed[entry_key] = entry_value
    return parsed


def load_terraform_outputs(terraform_dir: Path) -> TerraformOutputs | None:
    if not terraform_dir.is_dir():
        return None
    if shutil.which("terraform") is None:
        return None

    result = subprocess.run(
        ["terraform", f"-chdir={terraform_dir}", "output", "-json"],
        check=False,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None

    return parse_terraform_outputs(result.stdout)


def resolve_terraform_dir(args: argparse.Namespace) -> Path:
    if args.terraform_dir is not None:
        return args.terraform_dir.resolve()

    env_value = getenv_nonempty("SETTA_AWS_DEVBOX_TERRAFORM_DIR")
    if env_value is not None:
        return Path(env_value).expanduser().resolve()

    return DEFAULT_TERRAFORM_DIR


def getenv_nonempty(name: str) -> str | None:
    value = os.environ.get(name)
    if value is None:
        return None
    stripped = value.strip()
    if stripped == "":
        return None
    return stripped


def resolve_region(
    args: argparse.Namespace, tf_outputs: TerraformOutputs | None
) -> str:
    if args.region:
        return args.region

    for env_name in ("SETTA_AWS_DEVBOX_REGION", "AWS_REGION", "AWS_DEFAULT_REGION"):
        env_value = getenv_nonempty(env_name)
        if env_value is not None:
            return env_value

    if tf_outputs is not None and tf_outputs.region is not None:
        return tf_outputs.region

    return DEFAULT_REGION


def resolve_profile(args: argparse.Namespace) -> str | None:
    explicit_profile = getattr(args, "profile", None)
    if explicit_profile:
        return explicit_profile

    for env_name in (
        "SETTA_AWS_DEVBOX_PROFILE",
        "AWS_PROFILE",
        "AWS_DEFAULT_PROFILE",
    ):
        env_value = getenv_nonempty(env_name)
        if env_value is not None:
            return env_value

    return None


def resolve_repo_checkout_path(
    tf_outputs: TerraformOutputs | None,
) -> str | None:
    env_value = getenv_nonempty("SETTA_AWS_DEVBOX_REPO_CHECKOUT_PATH")
    if env_value is not None:
        return env_value
    if tf_outputs is not None and tf_outputs.repo_checkout_path is not None:
        return tf_outputs.repo_checkout_path
    return None


def profile_uses_sso(profile: str) -> bool:
    config_path = Path.home() / ".aws" / "config"
    if not config_path.is_file():
        return False

    parser = configparser.RawConfigParser()
    try:
        parser.read(config_path, encoding="utf-8")
    except configparser.Error:
        return False

    section_name = "default" if profile == "default" else f"profile {profile}"
    if not parser.has_section(section_name):
        return False

    for option_name in ("sso_session", "sso_start_url"):
        option_value = parser.get(section_name, option_name, fallback="").strip()
        if option_value != "":
            return True
    return False


def auto_sso_login_enabled() -> bool:
    raw_value = getenv_nonempty("SETTA_AWS_DEVBOX_AUTO_SSO_LOGIN")
    if raw_value is None:
        return True
    return raw_value.casefold() not in {"0", "false", "no", "off"}


def resolve_sso_login_mode() -> str:
    raw_value = getenv_nonempty("SETTA_AWS_DEVBOX_SSO_LOGIN_MODE")
    if raw_value is None:
        return "device-code"

    normalized = raw_value.casefold()
    if normalized in {"device-code", "device_code", "device"}:
        return "device-code"
    if normalized in {"device-code-no-browser", "device_code_no_browser", "manual"}:
        return "device-code-no-browser"
    if normalized == "browser":
        return "browser"

    raise SystemExit(
        "Unsupported SETTA_AWS_DEVBOX_SSO_LOGIN_MODE. "
        "Expected `device-code`, `device-code-no-browser`, or `browser`."
    )


def build_aws_sso_login_command(profile: str) -> list[str]:
    command = ["aws", "sso", "login", "--profile", profile]
    login_mode = resolve_sso_login_mode()
    if login_mode == "device-code":
        command.append("--use-device-code")
    elif login_mode == "device-code-no-browser":
        command.extend(["--use-device-code", "--no-browser"])
    return command


def resolve_remote_shell_command(args: argparse.Namespace) -> str:
    explicit_command = getattr(args, "command", None)
    if explicit_command:
        return explicit_command

    env_command = getenv_nonempty("SETTA_AWS_DEVBOX_REMOTE_COMMAND")
    if env_command is not None:
        return env_command

    return DEFAULT_REMOTE_SHELL_COMMAND


def resolve_port(
    explicit_port: int | None,
    tf_outputs: TerraformOutputs | None,
    key: str,
    fallback: int,
) -> int:
    if explicit_port is not None:
        return explicit_port
    if tf_outputs is not None and key in tf_outputs.default_ports:
        return tf_outputs.default_ports[key]
    return fallback


def resolve_discovery_tags(
    args: argparse.Namespace, tf_outputs: TerraformOutputs | None
) -> dict[str, str]:
    tags = dict(DEFAULT_DISCOVERY_TAGS)
    if tf_outputs is not None:
        tags.update(tf_outputs.discovery_tags)
    if args.name is not None:
        tags["Name"] = args.name
    env_name = getenv_nonempty("SETTA_AWS_DEVBOX_NAME")
    if env_name is not None and args.name is None:
        tags["Name"] = env_name
    return tags
