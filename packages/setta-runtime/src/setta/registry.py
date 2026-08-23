"""Generic registry interfaces for independently owned Setta applications."""

from __future__ import annotations

import os
import re
import sys
import webbrowser
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, TextIO

from .errors import InvalidInputError
from .runtime import PackagedRuntime
from .sessions import LiveSessionStore
from .supervisor import NativeServerSupervisor

_APP_ID = re.compile(r"^[a-z][a-z0-9-]*$")


@dataclass(frozen=True)
class AppDescriptor:
    app_id: str
    name: str
    summary: str

    def document(self) -> dict[str, str]:
        return {"id": self.app_id, "name": self.name, "summary": self.summary}


@dataclass
class CommandContext:
    """Process-local platform services made available to an app adapter."""

    runtime: PackagedRuntime
    sessions: LiveSessionStore
    supervisor: NativeServerSupervisor
    stdin: TextIO
    stdout: TextIO
    stderr: TextIO
    launcher_python: Path
    browser_open: Callable[[str], bool]
    basedpyright_resolver: Callable[[], Path] | None = None

    @classmethod
    def standard(
        cls,
        *,
        runtime: PackagedRuntime,
        sessions: LiveSessionStore,
        supervisor: NativeServerSupervisor,
    ) -> CommandContext:
        return cls(
            runtime=runtime,
            sessions=sessions,
            supervisor=supervisor,
            stdin=sys.stdin,
            stdout=sys.stdout,
            stderr=sys.stderr,
            # Preserve a virtual environment's launcher path. Resolving this
            # path on POSIX follows ``bin/python`` to the base interpreter and
            # bypasses the environment's ``pyvenv.cfg``.
            launcher_python=Path(os.path.abspath(sys.executable)),
            browser_open=webbrowser.open,
        )


class AppAdapter(Protocol):
    """An app-owned adapter registered with the platform command."""

    @property
    def descriptor(self) -> AppDescriptor: ...

    def dispatch(self, arguments: Sequence[str], context: CommandContext) -> int: ...

    def doctor(self, context: CommandContext) -> dict[str, object]: ...


class AppRegistry:
    """The authoritative installed-app inventory and dispatch lookup."""

    def __init__(self, adapters: Sequence[AppAdapter]):
        by_id: dict[str, AppAdapter] = {}
        for adapter in adapters:
            descriptor = adapter.descriptor
            if not _APP_ID.fullmatch(descriptor.app_id):
                raise InvalidInputError(
                    f"The registered app ID {descriptor.app_id!r} is invalid."
                )
            if descriptor.app_id in by_id:
                raise InvalidInputError(
                    f"The app ID {descriptor.app_id!r} is registered more than once."
                )
            by_id[descriptor.app_id] = adapter
        self._by_id = by_id

    def descriptors(self) -> tuple[AppDescriptor, ...]:
        return tuple(self._by_id[app_id].descriptor for app_id in sorted(self._by_id))

    def get(self, app_id: str) -> AppAdapter | None:
        return self._by_id.get(app_id)
