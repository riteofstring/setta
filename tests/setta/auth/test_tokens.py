import secrets
import unittest
from datetime import datetime, timedelta, timezone

from setta.auth.tokens import AuthCookieManager, BootstrapTokenManager


class BootstrapTokenManagerTests(unittest.TestCase):
    def test_mint_and_consume_round_trip(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-1", secret, now=now)
        payload = manager.consume(token, secret, now=now)

        self.assertEqual(payload.sessionId, "session-1")
        self.assertEqual(payload.exp, int(now.timestamp()) + 60)
        self.assertTrue(payload.nonce)

    def test_rejects_reused_token(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-2", secret, now=now)
        manager.consume(token, secret, now=now)

        with self.assertRaises(ValueError):
            manager.consume(token, secret, now=now)

    def test_rejects_expired_token(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-3", secret, now=now)
        later = now + timedelta(seconds=61)

        with self.assertRaises(ValueError):
            manager.consume(token, secret, now=later)

    def test_rejects_tampered_signature(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-4", secret, now=now)
        payload_part, signature_part = token.split(".", maxsplit=1)
        tampered = f"{payload_part}.{signature_part}x"

        with self.assertRaises(ValueError):
            manager.consume(tampered, secret, now=now)

    def test_rejects_invalid_encoding(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)

        with self.assertRaises(ValueError):
            manager.consume("a.a", secret)


class AuthCookieManagerTests(unittest.TestCase):
    def test_mint_and_validate_round_trip(self) -> None:
        manager = AuthCookieManager(ttl_seconds=3600)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-1", secret, now=now)
        payload = manager.validate(token, secret, now=now)

        self.assertEqual(payload.sessionId, "session-1")
        self.assertEqual(payload.exp, int(now.timestamp()) + 3600)

    def test_rejects_expired_cookie(self) -> None:
        manager = AuthCookieManager(ttl_seconds=5)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-2", secret, now=now)
        later = now + timedelta(seconds=6)

        with self.assertRaises(ValueError):
            manager.validate(token, secret, now=later)

    def test_rejects_tampered_cookie_signature(self) -> None:
        manager = AuthCookieManager(ttl_seconds=3600)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-3", secret, now=now)
        payload_part, signature_part = token.split(".", maxsplit=1)
        tampered = f"{payload_part}.{signature_part}x"

        with self.assertRaises(ValueError):
            manager.validate(tampered, secret, now=now)


if __name__ == "__main__":
    unittest.main()
