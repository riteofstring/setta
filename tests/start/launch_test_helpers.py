import socket

import pytest


def require_localhost_bind_or_skip() -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", 0))
    except OSError:
        pytest.skip("Socket binds are not permitted in this test environment.")
    finally:
        sock.close()
