import logging
import unittest

from setta.logging.errors import run_safely
from setta.logging.tasks import spawn_background_task


class LoggingErrorsTests(unittest.IsolatedAsyncioTestCase):
    async def test_run_safely_swallow_defaults_to_unhandled(self) -> None:
        async def boom() -> None:
            raise ValueError("nope")

        logger_name = "setta.tests.logging.errors.default_unhandled"
        logger = logging.getLogger(logger_name)

        with self.assertLogs(logger_name, level="ERROR") as captured:
            result = await run_safely(boom(), label="boom-test", logger=logger)

        self.assertIsNone(result)
        self.assertTrue(
            any(
                "Unhandled failure in boom-test" in message
                for message in captured.output
            )
        )

    async def test_run_safely_handled_is_warning_even_when_swallowed(self) -> None:
        async def boom() -> None:
            raise ValueError("nope")

        logger_name = "setta.tests.logging.errors.handled_warning"
        logger = logging.getLogger(logger_name)

        with self.assertLogs(logger_name, level="WARNING") as captured:
            result = await run_safely(
                boom(),
                label="boom-test",
                logger=logger,
                handled=True,
            )

        self.assertIsNone(result)
        self.assertTrue(
            any(message.startswith("WARNING:") for message in captured.output)
        )
        self.assertTrue(
            any(
                "Handled failure in boom-test" in message
                for message in captured.output
            )
        )

    async def test_run_safely_re_raise_severity_decoupled(self) -> None:
        async def boom() -> None:
            raise ValueError("nope")

        logger_name = "setta.tests.logging.errors.reraise"
        logger = logging.getLogger(logger_name)

        with self.assertLogs(logger_name, level="ERROR") as captured:
            with self.assertRaises(ValueError):
                await run_safely(
                    boom(),
                    label="boom-test",
                    logger=logger,
                    re_raise=True,
                )

        self.assertTrue(
            any(
                "Unhandled failure in boom-test" in message
                for message in captured.output
            )
        )

    async def test_spawn_background_task_defaults_to_unhandled(self) -> None:
        async def boom() -> None:
            raise ValueError("nope")

        logger_name = "setta.tests.logging.errors.spawn_default_unhandled"
        logger = logging.getLogger(logger_name)

        with self.assertLogs(logger_name, level="ERROR") as captured:
            task = spawn_background_task(boom(), label="bg-test", logger=logger)
            result = await task

        self.assertIsNone(result)
        self.assertTrue(
            any(
                "Unhandled failure in bg-test" in message
                for message in captured.output
            )
        )

    async def test_spawn_background_task_can_mark_failures_handled(self) -> None:
        async def boom() -> None:
            raise ValueError("nope")

        logger_name = "setta.tests.logging.errors.spawn_handled"
        logger = logging.getLogger(logger_name)

        with self.assertLogs(logger_name, level="WARNING") as captured:
            task = spawn_background_task(
                boom(),
                label="bg-test",
                logger=logger,
                handled=True,
            )
            result = await task

        self.assertIsNone(result)
        self.assertTrue(
            any("Handled failure in bg-test" in message for message in captured.output)
        )


if __name__ == "__main__":
    unittest.main()
