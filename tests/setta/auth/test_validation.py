import secrets
import unittest

from setta.auth.manager import AUTH_COOKIE_MANAGER, BOOTSTRAP_TOKEN_MANAGER
from setta.auth.validation import consume_bootstrap_token, validate_auth_cookie


class AuthValidationTests(unittest.TestCase):
    def test_validate_auth_cookie_accepts_matching_session(self) -> None:
        secret = secrets.token_bytes(32)
        session_id = "session-accept"
        token = AUTH_COOKIE_MANAGER.mint(session_id, secret)

        payload = validate_auth_cookie(token, session_id, secret)

        self.assertIsNotNone(payload)
        self.assertEqual(payload.sessionId, session_id)

    def test_validate_auth_cookie_rejects_session_mismatch(self) -> None:
        secret = secrets.token_bytes(32)
        token = AUTH_COOKIE_MANAGER.mint("session-a", secret)

        payload = validate_auth_cookie(token, "session-b", secret)

        self.assertIsNone(payload)

    def test_validate_auth_cookie_rejects_invalid_token(self) -> None:
        secret = secrets.token_bytes(32)

        payload = validate_auth_cookie("invalid-token", "session-a", secret)

        self.assertIsNone(payload)

    def test_validate_auth_cookie_rejects_invalid_encoding(self) -> None:
        secret = secrets.token_bytes(32)

        payload = validate_auth_cookie("a.a", "session-a", secret)

        self.assertIsNone(payload)

    def test_consume_bootstrap_token_accepts_matching_session(self) -> None:
        secret = secrets.token_bytes(32)
        session_id = "bootstrap-accept"
        token = BOOTSTRAP_TOKEN_MANAGER.mint(session_id, secret)

        payload = consume_bootstrap_token(token, session_id, secret)

        self.assertIsNotNone(payload)
        self.assertEqual(payload.sessionId, session_id)

    def test_consume_bootstrap_token_rejects_session_mismatch(self) -> None:
        secret = secrets.token_bytes(32)
        token = BOOTSTRAP_TOKEN_MANAGER.mint("session-a", secret)

        payload = consume_bootstrap_token(token, "session-b", secret)

        self.assertIsNone(payload)

    def test_consume_bootstrap_token_rejects_invalid_token(self) -> None:
        secret = secrets.token_bytes(32)

        payload = consume_bootstrap_token("invalid-token", "session-a", secret)

        self.assertIsNone(payload)

    def test_consume_bootstrap_token_rejects_invalid_encoding(self) -> None:
        secret = secrets.token_bytes(32)

        payload = consume_bootstrap_token("a.a", "session-a", secret)

        self.assertIsNone(payload)


if __name__ == "__main__":
    unittest.main()
