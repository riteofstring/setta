import subprocess
import sys
from pathlib import Path
from pathlib import PureWindowsPath

import click
import pytest

from setta.start import (
    _build_ssh_tunnel_command,
    _ensure_background_process_started,
    _format_remote_path,
    _resolve_deployment_root,
)
from setta.deployments.deployment_utils import parse_deployment_version
from setta.types.routes import Route
from setta.utils.constants import C
from setta.utils.network import (
    build_bootstrap_urls,
    format_host_for_ssh_tunnel,
    format_host_for_url,
)


@pytest.fixture
def share_root(tmp_path):
    original_share_deployments_folder = C.DEPLOYMENTS_FOLDER
    root = tmp_path / "setta_files" / "share_deployments"
    C.DEPLOYMENTS_FOLDER = root
    try:
        yield root
    finally:
        C.DEPLOYMENTS_FOLDER = original_share_deployments_folder


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


def test_format_remote_path_uses_posix_separators() -> None:
    windows_path = PureWindowsPath("setta_files\\runtime\\logs")
    assert _format_remote_path(windows_path) == "setta_files/runtime/logs"


def test_ensure_background_process_started_raises_on_exit() -> None:
    proc = subprocess.Popen(
        [sys.executable, "-c", "import sys; sys.exit(2)"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        proc.wait()
        with pytest.raises(click.ClickException):
            _ensure_background_process_started(proc, wait_seconds=0)
    finally:
        proc.wait()


def test_ensure_background_process_started_accepts_running() -> None:
    proc = subprocess.Popen(
        [sys.executable, "-c", "import time; time.sleep(0.2)"],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        _ensure_background_process_started(proc, wait_seconds=0.05)
    finally:
        proc.wait()


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


def test_resolve_share_deployment_root_uses_explicit_root(share_root) -> None:
    root = _create_deployment(share_root, "alpha", "v1")
    resolved = _resolve_deployment_root(
        deployment_root=root,
        deployment_name=None,
        deployment_version=None,
        latest=False,
    )
    assert resolved == root.resolve()


def test_resolve_share_deployment_root_rejects_mixed_args(share_root) -> None:
    root = _create_deployment(share_root, "alpha", "v1")
    with pytest.raises(click.ClickException):
        _resolve_deployment_root(
            deployment_root=root,
            deployment_name="alpha",
            deployment_version=None,
            latest=False,
        )


def test_resolve_share_deployment_root_requires_project_name(share_root) -> None:
    with pytest.raises(click.ClickException):
        _resolve_deployment_root(
            deployment_root=None,
            deployment_name=None,
            deployment_version=None,
            latest=False,
        )


def test_resolve_share_deployment_root_requires_version_or_latest(share_root) -> None:
    with pytest.raises(click.ClickException):
        _resolve_deployment_root(
            deployment_root=None,
            deployment_name="alpha",
            deployment_version=None,
            latest=False,
        )


def test_resolve_share_deployment_root_latest_selects_highest(share_root) -> None:
    _create_deployment(share_root, "alpha", "v1")
    expected = _create_deployment(share_root, "alpha", "v3")
    _create_deployment(share_root, "alpha", "v2")
    resolved = _resolve_deployment_root(
        deployment_root=None,
        deployment_name="alpha",
        deployment_version=None,
        latest=True,
    )
    assert resolved == expected.resolve()


def test_resolve_share_deployment_root_version_selects_path(share_root) -> None:
    expected = _create_deployment(share_root, "alpha", "v2")
    resolved = _resolve_deployment_root(
        deployment_root=None,
        deployment_name="alpha",
        deployment_version="v2",
        latest=False,
    )
    assert resolved == expected.resolve()


def test_resolve_share_deployment_root_rejects_invalid_version(share_root) -> None:
    _create_deployment(share_root, "alpha", "v1")
    with pytest.raises(click.ClickException):
        _resolve_deployment_root(
            deployment_root=None,
            deployment_name="alpha",
            deployment_version="1",
            latest=False,
        )
