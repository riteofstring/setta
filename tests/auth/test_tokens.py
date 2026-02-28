import secrets
from datetime import datetime, timedelta, timezone

import pytest

from setta.auth.tokens import (
    AuthCookieManager,
    BootstrapTokenManager,
    LaunchIntentTokenManager,
    NonceTracker,
)


class TestBootstrapTokenManager:
    def test_mint_and_consume_round_trip(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-1", secret, now=now)
        payload = manager.consume(token, secret, now=now)

        assert payload.sessionId == "session-1"
        assert payload.exp == int(now.timestamp()) + 60
        assert payload.nonce

    def test_rejects_reused_token(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-2", secret, now=now)
        manager.consume(token, secret, now=now)

        with pytest.raises(ValueError):
            manager.consume(token, secret, now=now)

    def test_rejects_expired_token(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-3", secret, now=now)
        later = now + timedelta(seconds=61)

        with pytest.raises(ValueError):
            manager.consume(token, secret, now=later)

    def test_rejects_tampered_signature(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-4", secret, now=now)
        payload_part, signature_part = token.split(".", maxsplit=1)
        tampered = f"{payload_part}.{signature_part}x"

        with pytest.raises(ValueError):
            manager.consume(tampered, secret, now=now)

    def test_rejects_invalid_encoding(self) -> None:
        manager = BootstrapTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)

        with pytest.raises(ValueError):
            manager.consume("a.a", secret)


class TestAuthCookieManager:
    def test_mint_and_validate_round_trip(self) -> None:
        manager = AuthCookieManager(ttl_seconds=3600)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-1", secret, now=now)
        payload = manager.validate(token, secret, now=now)

        assert payload.sessionId == "session-1"
        assert payload.exp == int(now.timestamp()) + 3600

    def test_rejects_expired_cookie(self) -> None:
        manager = AuthCookieManager(ttl_seconds=5)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-2", secret, now=now)
        later = now + timedelta(seconds=6)

        with pytest.raises(ValueError):
            manager.validate(token, secret, now=later)

    def test_rejects_tampered_cookie_signature(self) -> None:
        manager = AuthCookieManager(ttl_seconds=3600)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token = manager.mint("session-3", secret, now=now)
        payload_part, signature_part = token.split(".", maxsplit=1)
        tampered = f"{payload_part}.{signature_part}x"

        with pytest.raises(ValueError):
            manager.validate(tampered, secret, now=now)


class TestLaunchIntentTokenManager:
    def test_mint_and_validate_round_trip(self) -> None:
        manager = LaunchIntentTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token, exp = manager.mint("session-1", secret, now=now)
        payload = manager.validate(token, secret, now=now)

        assert payload.sessionId == "session-1"
        assert payload.exp == int(now.timestamp()) + 60
        assert payload.exp == exp
        assert payload.purpose == "launch_intent"
        assert payload.nonce

    def test_rejects_expired_token(self) -> None:
        manager = LaunchIntentTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token, _ = manager.mint("session-3", secret, now=now)
        later = now + timedelta(seconds=61)

        with pytest.raises(ValueError):
            manager.validate(token, secret, now=later)

    def test_rejects_tampered_signature(self) -> None:
        manager = LaunchIntentTokenManager(ttl_seconds=60)
        secret = secrets.token_bytes(32)
        now = datetime(2025, 1, 1, tzinfo=timezone.utc)

        token, _ = manager.mint("session-4", secret, now=now)
        payload_part, signature_part = token.split(".", maxsplit=1)
        tampered = f"{payload_part}.{signature_part}x"

        with pytest.raises(ValueError):
            manager.validate(tampered, secret, now=now)


class TestNonceTracker:
    def test_prunes_expired_nonces(self) -> None:
        tracker = NonceTracker()
        tracker.consume("session-1", "nonce-1", exp=10, now=0)

        assert tracker.is_consumed("session-1", "nonce-1", now=0)
        assert not tracker.is_consumed("session-1", "nonce-1", now=10)
