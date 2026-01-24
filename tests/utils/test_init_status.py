import unittest

from setta.utils.constants import C
from setta.utils.init_status import BackendInitializationStatus


class BackendInitStatusTests(unittest.TestCase):
    def test_snapshot_includes_auth_refresh_window(self) -> None:
        status = BackendInitializationStatus()
        snapshot = status.snapshot()

        self.assertEqual(
            snapshot.authCookieRefreshWindowSeconds,
            C.AUTH_COOKIE_REFRESH_WINDOW_SECONDS,
        )


if __name__ == "__main__":
    unittest.main()
