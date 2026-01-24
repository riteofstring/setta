import unittest

from setta.utils.constants import C
from setta.utils.init_status import (
    BackendInitializationStatus,
    get_auth_refresh_status,
)


class BackendInitStatusTests(unittest.TestCase):
    def test_snapshot_includes_auth_refresh_window(self) -> None:
        status = BackendInitializationStatus()
        snapshot = status.snapshot()

        self.assertEqual(
            snapshot.authCookieRefreshWindowSeconds,
            C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS,
        )

    def test_auth_refresh_status_includes_refresh_window(self) -> None:
        status = get_auth_refresh_status()
        self.assertEqual(
            status.authCookieRefreshWindowSeconds,
            C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS,
        )


if __name__ == "__main__":
    unittest.main()
