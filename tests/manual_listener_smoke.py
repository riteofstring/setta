"""
Manual SettaListener smoke-check script used by docs/setta-listener-plan.md.

Run this once the dev stack is up (frontend + backend) to verify that the
listener receives snapshot refreshes when a control changes in the UI.
"""

import argparse
import importlib
import json
import logging
from pathlib import Path
from typing import Any, Callable

from setta.api import SettaListener
from setta.api.listener import ListenerCallbackBuilder
from setta.logging.config import configure_listener_logging
from setta.types.dependency_key import (
    SectionDependencyKey,
    SectionParamDependencyKey,
)

logger = logging.getLogger(__name__)


def _structured_dependency_map(
    listener: SettaListener, callback: Callable[..., Any]
) -> dict[str, str]:
    """Return structured dependency identifiers keyed by declared dependency."""

    def _format_key(key: SectionDependencyKey | SectionParamDependencyKey) -> str:
        code_obj = key.codeObjId if isinstance(key, SectionParamDependencyKey) else "*"
        return f"{key.sectionId}:{code_obj}"

    for spec in listener._callbacks.values():
        if spec.function is callback and spec.structured_dependencies:
            return {
                declared: _format_key(key)
                for declared, key in zip(
                    spec.declared_dependencies,
                    spec.structured_dependencies,
                )
            }
    return {}


def load_default_project_name() -> str:
    """Read the project name that ships with the repository fixtures."""
    data = json.loads(Path("setta_files/project.json").read_text())
    project_config_id = data["defaultProjectConfigId"]
    try:
        project_config = data["projectConfigs"][project_config_id]
    except KeyError as error:
        raise ValueError("Default project config missing from project.json") from error
    return project_config["name"]


def build_listener(project_name: str) -> SettaListener:
    """Wire the example callback that watches the Channel Shuffle groups param."""
    listener = SettaListener(project_name=project_name)

    @listener.listen(deps=["hiding_river__x"])
    def on_groups_change(state: Any, ctx: Any) -> None:
        structured = _structured_dependency_map(listener, on_groups_change)
        structured_changed = {
            dep: structured.get(dep, "<pending>") for dep in ctx.changed
        }
        print(f"[listener] groups -> {state.hiding_river__x}")
        print(f"[listener] delta  -> {ctx.changed}")
        print(f"[listener] keys   -> {structured_changed}")

    return listener


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manual smoke test for SettaListener force refresh snapshots."
    )
    parser.add_argument(
        "--project-name",
        default=None,
        help="Override the project config name to watch (defaults to repository fixture).",
    )
    parser.add_argument(
        "--hot-reload",
        action="store_true",
        help="Enable ListenerHotReloader and watch the callback module for edits.",
    )
    parser.add_argument(
        "--builder-module",
        default="tests.manual_listener_hot_reload_callbacks",
        help="Module path that exposes the callback builder (used with --hot-reload).",
    )
    parser.add_argument(
        "--builder-name",
        default="build_callbacks",
        help="Attribute name of the callback builder inside the module (used with --hot-reload).",
    )
    parser.add_argument(
        "--watch-path",
        action="append",
        dest="watch_paths",
        help="Additional files, directories, or glob patterns to watch for edits (used with --hot-reload).",
    )
    parser.add_argument(
        "--ignore-pattern",
        action="append",
        dest="ignore_patterns",
        help="Glob patterns to ignore relative to watched directories (used with --hot-reload).",
    )
    parser.add_argument(
        "--no-refresh",
        action="store_true",
        help="Skip replaying the cached snapshot when reloading callbacks.",
    )
    parser.add_argument(
        "--settle-delay",
        type=float,
        default=None,
        help="Override the hot reload watcher settle delay in seconds.",
    )
    args = parser.parse_args()

    configure_listener_logging(level_override="INFO")

    project_name = args.project_name or load_default_project_name()
    listener = build_listener(project_name)

    if args.hot_reload:
        builder = _resolve_builder(args.builder_module, args.builder_name)
        logger.info(
            "Hot reload enabled: edit %s to trigger callback refresh.",
            args.builder_module,
        )
        if args.watch_paths:
            logger.info("Additional watch targets: %s", ", ".join(args.watch_paths))
        if args.ignore_patterns:
            logger.info("Ignored patterns: %s", ", ".join(args.ignore_patterns))
        try:
            listener.start(
                hot_reload=True,
                builder=builder,
                extra_watch_paths=args.watch_paths,
                ignore_patterns=args.ignore_patterns,
                trigger_refresh=not args.no_refresh,
                settle_delay=args.settle_delay,
            )
        except KeyboardInterrupt:
            logger.info("Listener stopped via keyboard interrupt.")
        return

    try:
        listener.start()
    except KeyboardInterrupt:
        logger.info("Listener stopped via keyboard interrupt.")


def _resolve_builder(module_name: str, builder_name: str) -> ListenerCallbackBuilder:
    module = importlib.import_module(module_name)
    try:
        builder: ListenerCallbackBuilder = getattr(module, builder_name)
    except AttributeError as error:
        raise ValueError(
            f"Listener builder attribute {builder_name!r} missing in module {module_name!r}"
        ) from error
    if not callable(builder):
        raise TypeError(
            f"Listener builder attribute {builder_name!r} in module {module_name!r} is not callable"
        )
    return builder


if __name__ == "__main__":
    main()
