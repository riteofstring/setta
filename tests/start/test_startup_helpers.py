import subprocess
import sys
from pathlib import Path

from setta.types.routes import Route
from setta.startup_runtime import (
    _build_ssh_tunnel_command,
    _is_loopback_host,
    _warn_if_public_host_no_auth,
)
from setta.deployments.deployment_utils import parse_deployment_version
from setta.utils.constants import C
from setta.utils.network import (
    build_bootstrap_urls,
    format_host_for_ssh_tunnel,
    format_host_for_url,
)


def test_format_host_for_url_rewrites_wildcards() -> None:
    assert format_host_for_url("0.0.0.0") == "127.0.0.1"
    assert format_host_for_url("::") == "[::1]"


def test_format_host_for_url_brackets_ipv6() -> None:
    assert format_host_for_url("2001:db8::1") == "[2001:db8::1]"
    assert format_host_for_url("[2001:db8::2]") == "[2001:db8::2]"


def test_format_host_for_ssh_tunnel() -> None:
    assert format_host_for_ssh_tunnel("0.0.0.0") == "127.0.0.1"
    assert format_host_for_ssh_tunnel("::") == "[::1]"
    assert format_host_for_ssh_tunnel("2001:db8::1") == "[2001:db8::1]"
    assert format_host_for_ssh_tunnel("[2001:db8::2]") == "[2001:db8::2]"


def test_build_bootstrap_urls() -> None:
    token = "token123"
    fragment, plain = build_bootstrap_urls("127.0.0.1", 61234, token)
    expected_base = f"http://127.0.0.1:61234{Route.BOOTSTRAP_PAGE.value}"
    assert fragment == f"{expected_base}#token={token}"
    assert plain == expected_base


def test_build_ssh_tunnel_command_uses_host() -> None:
    command = _build_ssh_tunnel_command("10.0.0.5", 61234)
    assert "10.0.0.5:61234" in command
    ipv6_command = _build_ssh_tunnel_command("2001:db8::1", 61235)
    assert "[2001:db8::1]:61235" in ipv6_command


def test_parse_deployment_version() -> None:
    assert parse_deployment_version("v3") == 3
    assert parse_deployment_version("v0") == 0
    assert parse_deployment_version("3") is None
    assert parse_deployment_version("v") is None
    assert parse_deployment_version("v3x") is None


def _create_deployment(share_root: Path, deployment_name: str, version: str) -> Path:
    path = share_root / deployment_name / version
    path.mkdir(parents=True, exist_ok=True)
    return path


def test_is_loopback_host() -> None:
    assert _is_loopback_host("127.0.0.1")
    assert _is_loopback_host("localhost")
    assert _is_loopback_host("::1")
    assert not _is_loopback_host("0.0.0.0")
    assert not _is_loopback_host("10.0.0.5")


def test_warn_if_public_host_no_auth_emits_warning_for_public_host(capsys) -> None:
    _warn_if_public_host_no_auth(mode="share", host="0.0.0.0")
    captured = capsys.readouterr()
    assert "WARNING:" in captured.err
    assert "share mode disables auth" in captured.err


def test_warn_if_public_host_no_auth_is_silent_for_loopback(capsys) -> None:
    _warn_if_public_host_no_auth(mode="app", host="127.0.0.1")
    captured = capsys.readouterr()
    assert captured.err == ""
