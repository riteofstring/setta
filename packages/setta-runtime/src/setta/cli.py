from __future__ import annotations

import sys
from collections.abc import Callable, Sequence

from . import __version__
from .apps import PythonCanvasAdapter
from .errors import InvalidInputError, SettaError, UnknownCommandError
from .jsonio import write_json
from .registry import AppRegistry, CommandContext
from .runtime import PackagedRuntime
from .sessions import LiveSessionStore
from .supervisor import NativeServerSupervisor


def installed_apps() -> AppRegistry:

    return AppRegistry((PythonCanvasAdapter(),))


def main(arguments: Sequence[str] | None = None) -> int:
    return run(arguments if arguments is not None else sys.argv[1:])


def run(
    arguments: Sequence[str],
    *,
    registry: AppRegistry | None = None,
    context_factory: Callable[[], CommandContext] | None = None,
) -> int:

    selected_registry = registry or installed_apps()
    selected_context_factory = context_factory or _standard_context
    context = selected_context_factory()
    try:
        return _dispatch(tuple(arguments), selected_registry, context)
    except SettaError as error:
        write_json(context.stderr, error.document())
        return error.exit_code


def _dispatch(
    arguments: tuple[str, ...],
    registry: AppRegistry,
    context: CommandContext,
) -> int:
    if not arguments or arguments[0] in {"--help", "-h", "help"}:
        _write_help(context, registry)
        return 0
    if arguments == ("--version",):
        context.stdout.write(f"{__version__}\n")
        return 0
    root_command, *remaining = arguments
    if root_command == "apps":
        return _apps(tuple(remaining), registry, context)
    if root_command == "doctor":
        return _doctor(tuple(remaining), registry, context)
    adapter = registry.get(root_command)
    if adapter is None:
        raise UnknownCommandError(f"Unknown Setta app or command {root_command!r}.")
    return adapter.dispatch(tuple(remaining), context)


def _apps(
    arguments: tuple[str, ...], registry: AppRegistry, context: CommandContext
) -> int:
    if arguments == ("--help",) or arguments == ("-h",):
        context.stdout.write("Usage: setta apps [--json]\n")
        return 0
    if arguments not in {(), ("--json",)}:
        raise InvalidInputError("apps accepts only the optional --json flag.")
    apps = [descriptor.document() for descriptor in registry.descriptors()]
    if arguments == ("--json",):
        write_json(context.stdout, {"apps": apps, "schemaVersion": "setta-apps/v1"})
        return 0
    for descriptor in apps:
        context.stdout.write(f"{descriptor['id']}\t{descriptor['name']}\n")
    return 0


def _doctor(
    arguments: tuple[str, ...], registry: AppRegistry, context: CommandContext
) -> int:
    if arguments == ("--help",) or arguments == ("-h",):
        context.stdout.write("Usage: setta doctor [--json]\n")
        return 0
    if arguments not in {(), ("--json",)}:
        raise InvalidInputError("doctor accepts only the optional --json flag.")
    checks: list[dict[str, object]] = []
    try:
        runtime_check = context.runtime.check()
        checks.append({"name": "packaged-runtime", "status": "ok", **runtime_check})
    except SettaError as error:
        checks.append(
            {"name": "packaged-runtime", "status": "error", "code": error.code}
        )
    apps = [
        adapter.doctor(context)
        for adapter in (registry.get(item.app_id) for item in registry.descriptors())
        if adapter is not None
    ]
    status = (
        "ok"
        if all(check["status"] == "ok" for check in checks)
        and all(app.get("status") == "ok" for app in apps)
        else "error"
    )
    document = {
        "apps": apps,
        "checks": checks,
        "schemaVersion": "setta-doctor/v1",
        "status": status,
    }
    if arguments == ("--json",):
        write_json(context.stdout, document)
    else:
        context.stdout.write(f"{status}\n")
    return 0 if status == "ok" else 1


def _standard_context() -> CommandContext:
    return CommandContext.standard(
        runtime=PackagedRuntime(),
        sessions=LiveSessionStore(),
        supervisor=NativeServerSupervisor(),
    )


def _write_help(context: CommandContext, registry: AppRegistry) -> None:
    context.stdout.write(
        "Usage: setta [--version|apps|doctor|APP ...]\n\nInstalled apps:\n"
    )
    for descriptor in registry.descriptors():
        context.stdout.write(f"  {descriptor.app_id}\t{descriptor.summary}\n")
