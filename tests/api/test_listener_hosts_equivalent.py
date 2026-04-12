from setta.api.listener import _hosts_equivalent


def test_hosts_equivalent_treats_loopback_values_as_equivalent() -> None:
    assert _hosts_equivalent("localhost", "127.0.0.1")
    assert _hosts_equivalent("localhost", "::1")
    assert _hosts_equivalent("127.0.0.1", "::1")
    assert _hosts_equivalent("127.0.0.1", "127.0.0.1")
    assert not _hosts_equivalent("example.com", "127.0.0.1")

