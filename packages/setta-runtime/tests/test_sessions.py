from __future__ import annotations

import os
import tempfile
import unittest
from dataclasses import replace
from pathlib import Path

from setta.errors import (
    RuntimeExecutionError,
    SessionAlreadyRunningError,
    SessionNotFoundError,
)
from setta.sessions import (
    _WINDOWS_ERROR_ACCESS_DENIED,
    _WINDOWS_ERROR_INVALID_PARAMETER,
    _WINDOWS_ERROR_NOT_FOUND,
    _WINDOWS_STILL_ACTIVE,
    LiveSession,
    LiveSessionStore,
    _process_is_alive,
    _windows_process_is_alive,
)


class _WindowsProbe:
    def __init__(
        self,
        *,
        handle: int,
        open_error: int = 0,
        exit_code: int | None = _WINDOWS_STILL_ACTIVE,
        closes: bool = True,
    ) -> None:
        self._handle = handle
        self._open_error = open_error
        self._exit_code = exit_code
        self._closes = closes
        self.queried_pid: int | None = None
        self.closed_handle: int | None = None

    def open_query_handle(self, process_id: int) -> int:
        self.queried_pid = process_id
        return self._handle

    def last_error(self) -> int:
        return self._open_error

    def exit_code(self, handle: int) -> int | None:
        self.queried_pid = handle
        return self._exit_code

    def close_handle(self, handle: int) -> bool:
        self.closed_handle = handle
        return self._closes


class LiveSessionStoreTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.project = Path(self.temporary.name) / "project"
        self.store = LiveSessionStore(
            Path(self.temporary.name) / "sessions",
            process_alive=lambda _pid: True,
        )
        self.project_path = self.store.canonical_project_path(self.project)

    def _session(self, nonce: str = "owner-nonce") -> LiveSession:
        return LiveSession(
            app_id="fixture-app",
            project_path=self.project_path,
            url="http://127.0.0.1:43123",
            owner_pid=os.getpid(),
            instance_nonce=nonce,
        )

    @staticmethod
    def _verify(_session: LiveSession) -> bool:
        return True

    def test_resolve_during_live_session_after_publish(self) -> None:
        session = self._session()
        with self.store.claim("fixture-app", self.project, self._verify) as lease:
            lease.publish(session)
            self.assertEqual(
                self.store.resolve("fixture-app", self.project, self._verify), session
            )
        self.assertEqual(
            self.store.resolve("fixture-app", self.project, self._verify), session
        )

    def test_duplicate_open_is_rejected_before_publish(self) -> None:
        lease = self.store.claim("fixture-app", self.project, self._verify)
        try:
            with self.assertRaises(SessionAlreadyRunningError):
                self.store.claim("fixture-app", self.project, self._verify)
        finally:
            lease.close()

    def test_duplicate_open_is_rejected_after_publish(self) -> None:
        with self.store.claim("fixture-app", self.project, self._verify) as lease:
            lease.publish(self._session())
            with self.assertRaises(SessionAlreadyRunningError):
                self.store.claim("fixture-app", self.project, self._verify)

    def test_owned_cleanup_preserves_newer_or_other_owner_record(self) -> None:
        session = self._session()
        with self.store.claim("fixture-app", self.project, self._verify) as lease:
            lease.publish(session)
        self.store.remove_if_owned(replace(session, instance_nonce="different-owner"))
        self.assertEqual(
            self.store.resolve("fixture-app", self.project, self._verify), session
        )
        self.store.remove_if_owned(session)
        with self.assertRaises(SessionNotFoundError):
            self.store.resolve("fixture-app", self.project, self._verify)


class ProcessLivenessTests(unittest.TestCase):
    def test_posix_dispatch_uses_signal_zero_probe(self) -> None:
        calls: list[int] = []

        def posix_probe(pid: int) -> bool:
            calls.append(pid)
            return True

        self.assertTrue(
            _process_is_alive(123, "posix", lambda _pid: False, posix_probe)
        )
        self.assertEqual(calls, [123])

    def test_windows_dispatch_uses_query_probe_without_signal_zero(self) -> None:
        calls: list[int] = []

        def windows_probe(pid: int) -> bool:
            calls.append(pid)
            return True

        self.assertTrue(_process_is_alive(456, "nt", windows_probe, lambda _pid: False))
        self.assertEqual(calls, [456])

    def test_windows_query_reports_active_and_closes_its_handle(self) -> None:
        probe = _WindowsProbe(handle=17, exit_code=_WINDOWS_STILL_ACTIVE)
        self.assertTrue(_windows_process_is_alive(456, probe))
        self.assertEqual(probe.queried_pid, 17)
        self.assertEqual(probe.closed_handle, 17)

    def test_windows_query_reports_a_terminated_process(self) -> None:
        probe = _WindowsProbe(handle=17, exit_code=0)
        self.assertFalse(_windows_process_is_alive(456, probe))
        self.assertEqual(probe.closed_handle, 17)

    def test_windows_open_access_denied_keeps_the_session_live(self) -> None:
        probe = _WindowsProbe(handle=0, open_error=_WINDOWS_ERROR_ACCESS_DENIED)
        self.assertTrue(_windows_process_is_alive(456, probe))
        self.assertIsNone(probe.closed_handle)

    def test_windows_open_invalid_or_missing_process_is_dead(self) -> None:
        for error in (_WINDOWS_ERROR_INVALID_PARAMETER, _WINDOWS_ERROR_NOT_FOUND):
            with self.subTest(error=error):
                probe = _WindowsProbe(handle=0, open_error=error)
                self.assertFalse(_windows_process_is_alive(456, probe))
                self.assertIsNone(probe.closed_handle)

    def test_windows_query_errors_and_close_failures_are_typed(self) -> None:
        with (
            self.subTest("exit code failure"),
            self.assertRaises(RuntimeExecutionError),
        ):
            _windows_process_is_alive(456, _WindowsProbe(handle=17, exit_code=None))
        with self.subTest("close failure"), self.assertRaises(RuntimeExecutionError):
            _windows_process_is_alive(
                456,
                _WindowsProbe(handle=17, exit_code=_WINDOWS_STILL_ACTIVE, closes=False),
            )
