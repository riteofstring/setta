import unittest

from setta.start import _build_ssh_tunnel_command
from setta.types.routes import Route
from setta.utils.network import (
    build_bootstrap_urls,
    format_host_for_ssh_tunnel,
    format_host_for_url,
)


class StartupHelperTests(unittest.TestCase):
    def test_format_host_for_url_rewrites_wildcards(self) -> None:
        self.assertEqual(format_host_for_url("0.0.0.0"), "127.0.0.1")
        self.assertEqual(format_host_for_url("::"), "127.0.0.1")

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


if __name__ == "__main__":
    unittest.main()
