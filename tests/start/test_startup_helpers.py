import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from pathlib import PureWindowsPath

import click

from setta.start import (
    _build_ssh_tunnel_command,
    _ensure_background_process_started,
    _format_remote_path,
    _parse_share_deployment_version,
    _resolve_share_deployment_root,
)
from setta.types.routes import Route
from setta.utils.constants import C
from setta.utils.network import (
    build_bootstrap_urls,
    format_host_for_ssh_tunnel,
    format_host_for_url,
)


class StartupHelperTests(unittest.TestCase):
    def test_format_host_for_url_rewrites_wildcards(self) -> None:
        self.assertEqual(format_host_for_url("0.0.0.0"), "127.0.0.1")
        self.assertEqual(format_host_for_url("::"), "[::1]")

    def test_format_host_for_url_brackets_ipv6(self) -> None:
        self.assertEqual(format_host_for_url("2001:db8::1"), "[2001:db8::1]")
        self.assertEqual(format_host_for_url("[2001:db8::2]"), "[2001:db8::2]")

    def test_format_host_for_ssh_tunnel(self) -> None:
        self.assertEqual(format_host_for_ssh_tunnel("0.0.0.0"), "127.0.0.1")
        self.assertEqual(format_host_for_ssh_tunnel("::"), "[::1]")
        self.assertEqual(format_host_for_ssh_tunnel("2001:db8::1"), "[2001:db8::1]")
        self.assertEqual(
            format_host_for_ssh_tunnel("[2001:db8::2]"), "[2001:db8::2]"
        )

    def test_build_bootstrap_urls(self) -> None:
        token = "token123"
        fragment, plain = build_bootstrap_urls("127.0.0.1", 61234, token)
        expected_base = f"http://127.0.0.1:61234{Route.BOOTSTRAP_PAGE.value}"
        self.assertEqual(fragment, f"{expected_base}#token={token}")
        self.assertEqual(plain, expected_base)

    def test_build_ssh_tunnel_command_uses_host(self) -> None:
        command = _build_ssh_tunnel_command("10.0.0.5", 61234)
        self.assertIn("10.0.0.5:61234", command)
        ipv6_command = _build_ssh_tunnel_command("2001:db8::1", 61235)
        self.assertIn("[2001:db8::1]:61235", ipv6_command)

    def test_format_remote_path_uses_posix_separators(self) -> None:
        windows_path = PureWindowsPath("setta_files\\run\\logs")
        self.assertEqual(_format_remote_path(windows_path), "setta_files/run/logs")

    def test_ensure_background_process_started_raises_on_exit(self) -> None:
        proc = subprocess.Popen(
            [sys.executable, "-c", "import sys; sys.exit(2)"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(proc.wait)
        with self.assertRaises(click.ClickException):
            _ensure_background_process_started(proc, wait_seconds=0.05)

    def test_ensure_background_process_started_accepts_running(self) -> None:
        proc = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(0.2)"],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        self.addCleanup(proc.wait)
        _ensure_background_process_started(proc, wait_seconds=0.05)


class ShareStartupHelperTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp_dir.cleanup)

        self.original_share_deployments_folder = C.SHARE_DEPLOYMENTS_FOLDER
        self.addCleanup(self._restore_share_deployments_folder)
        self.share_root = (
            Path(self.temp_dir.name) / "setta_files" / "share_deployments"
        )
        C.SHARE_DEPLOYMENTS_FOLDER = self.share_root

    def _restore_share_deployments_folder(self) -> None:
        C.SHARE_DEPLOYMENTS_FOLDER = self.original_share_deployments_folder

    def _create_deployment(self, project_name: str, version: str) -> Path:
        path = self.share_root / project_name / version
        path.mkdir(parents=True, exist_ok=True)
        return path

    def test_parse_share_deployment_version(self) -> None:
        self.assertEqual(_parse_share_deployment_version("v3"), 3)
        self.assertEqual(_parse_share_deployment_version("v0"), 0)
        self.assertIsNone(_parse_share_deployment_version("3"))
        self.assertIsNone(_parse_share_deployment_version("v"))
        self.assertIsNone(_parse_share_deployment_version("v3x"))

    def test_resolve_share_deployment_root_uses_explicit_root(self) -> None:
        root = self._create_deployment("alpha", "v1")
        resolved = _resolve_share_deployment_root(
            deployment_root=root,
            project_config_name=None,
            deployment_version=None,
            latest=False,
        )
        self.assertEqual(resolved, root.resolve())

    def test_resolve_share_deployment_root_rejects_mixed_args(self) -> None:
        root = self._create_deployment("alpha", "v1")
        with self.assertRaises(click.ClickException):
            _resolve_share_deployment_root(
                deployment_root=root,
                project_config_name="alpha",
                deployment_version=None,
                latest=False,
            )

    def test_resolve_share_deployment_root_requires_project_name(self) -> None:
        with self.assertRaises(click.ClickException):
            _resolve_share_deployment_root(
                deployment_root=None,
                project_config_name=None,
                deployment_version=None,
                latest=False,
            )

    def test_resolve_share_deployment_root_requires_version_or_latest(self) -> None:
        with self.assertRaises(click.ClickException):
            _resolve_share_deployment_root(
                deployment_root=None,
                project_config_name="alpha",
                deployment_version=None,
                latest=False,
            )

    def test_resolve_share_deployment_root_latest_selects_highest(self) -> None:
        self._create_deployment("alpha", "v1")
        expected = self._create_deployment("alpha", "v3")
        self._create_deployment("alpha", "v2")
        resolved = _resolve_share_deployment_root(
            deployment_root=None,
            project_config_name="alpha",
            deployment_version=None,
            latest=True,
        )
        self.assertEqual(resolved, expected.resolve())

    def test_resolve_share_deployment_root_version_selects_path(self) -> None:
        expected = self._create_deployment("alpha", "v2")
        resolved = _resolve_share_deployment_root(
            deployment_root=None,
            project_config_name="alpha",
            deployment_version="v2",
            latest=False,
        )
        self.assertEqual(resolved, expected.resolve())

    def test_resolve_share_deployment_root_rejects_invalid_version(self) -> None:
        self._create_deployment("alpha", "v1")
        with self.assertRaises(click.ClickException):
            _resolve_share_deployment_root(
                deployment_root=None,
                project_config_name="alpha",
                deployment_version="1",
                latest=False,
            )


if __name__ == "__main__":
    unittest.main()
