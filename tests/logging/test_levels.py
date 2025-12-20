import logging
import os
import unittest

from setta.logging.levels import parse_log_level, resolve_log_level


class LoggingLevelTests(unittest.TestCase):
    def test_parse_log_level_accepts_named_levels(self) -> None:
        self.assertEqual(parse_log_level("info"), logging.INFO)
        self.assertEqual(parse_log_level(" WARNING "), logging.WARNING)

    def test_parse_log_level_accepts_numeric_levels(self) -> None:
        self.assertEqual(parse_log_level("10"), 10)
        self.assertEqual(parse_log_level(15), 15)

    def test_parse_log_level_rejects_invalid_strings(self) -> None:
        with self.assertRaises(ValueError):
            parse_log_level("not-a-level")

    def test_resolve_log_level_prefers_override(self) -> None:
        self.assertEqual(
            resolve_log_level(
                level_override="warning",
                env_var="SETTA_TEST_LOG_LEVEL",
                default_level="info",
            ),
            logging.WARNING,
        )

    def test_resolve_log_level_falls_back_to_env_then_default(self) -> None:
        env_var = "SETTA_TEST_LOG_LEVEL"
        original = os.environ.get(env_var)
        os.environ[env_var] = "error"
        try:
            self.assertEqual(
                resolve_log_level(
                    level_override=None,
                    env_var=env_var,
                    default_level="info",
                ),
                logging.ERROR,
            )
        finally:
            if original is None:
                os.environ.pop(env_var, None)
            else:
                os.environ[env_var] = original

        original = os.environ.get(env_var)
        os.environ[env_var] = "not-a-level"
        try:
            self.assertEqual(
                resolve_log_level(
                    level_override=None,
                    env_var=env_var,
                    default_level="info",
                ),
                logging.INFO,
            )
        finally:
            if original is None:
                os.environ.pop(env_var, None)
            else:
                os.environ[env_var] = original


if __name__ == "__main__":
    unittest.main()
