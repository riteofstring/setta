import unittest
from datetime import datetime, timedelta, timezone

from setta.auth.tokens import BootstrapTokenManager


class BootstrapTokenManagerTests(unittest.TestCase):
    def test_mint_and_consume_round_trip(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = b"token-secret"
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-1", secret, now=now)
        payload = manager.consume(token, secret, now=now)

        self.assertEqual(payload.sessionId, "session-1")
        self.assertGreater(payload.exp, int(now.timestamp()))
        self.assertTrue(payload.nonce)

    def test_consume_rejects_reuse(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = b"token-secret"
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-1", secret, now=now)
        manager.consume(token, secret, now=now)

        with self.assertRaises(ValueError):
            manager.consume(token, secret, now=now)

    def test_consume_rejects_expired_token(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=1)
        secret = b"token-secret"
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-1", secret, now=now)

        with self.assertRaises(ValueError):
            manager.consume(token, secret, now=now + timedelta(seconds=2))

    def test_consume_rejects_invalid_signature(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = b"token-secret"
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-1", secret, now=now)
        payload_part, signature_part = token.split(".")
        replacement = "A" if signature_part[-1] != "A" else "B"
        tampered_signature = f"{signature_part[:-1]}{replacement}"
        tampered_token = f"{payload_part}.{tampered_signature}"

        with self.assertRaises(ValueError):
            manager.consume(tampered_token, secret, now=now)


if __name__ == "__main__":
    unittest.main()
