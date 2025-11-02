"""
Manual SettaListener smoke-check script used by docs/setta-listener-plan.md.

Run this once the dev stack is up (frontend + backend) to verify that the
listener receives persisted updates when a control changes in the UI.
"""

import argparse
import importlib
import json
import logging
import sys
from pathlib import Path
from typing import Any

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / "backend"
BACKEND_PATH = str(BACKEND_DIR)
if BACKEND_PATH in sys.path:
    sys.path.remove(BACKEND_PATH)
ROOT_PATH = str(ROOT_DIR)
if ROOT_PATH not in sys.path:
    sys.path.insert(0, ROOT_PATH)
sys.path.insert(0, BACKEND_PATH)

from setta.api import SettaListener
from setta.api.hot_reload import ListenerHotReloader

logger = logging.getLogger(__name__)


def _structured_dependency_map(
    listener: SettaListener, callback: Any
) -> dict[str, str]:
    """Return structured dependency identifiers keyed by declared dependency."""
    for spec in listener._callbacks.values():
        if spec.function is callback and spec.structured_dependencies:
            return {
                declared: f"{key.sectionId}:{key.codeObjId or '*'}"
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

    @listener.listen(deps=["hiding_river__x"], feed="both")
    def on_groups_change(state: Any, ctx: Any) -> None:
        structured = _structured_dependency_map(listener, on_groups_change)
        structured_changed = {
            dep: structured.get(dep, "<pending>") for dep in ctx.changed
        }
        print(f"[listener] groups -> {state.hiding_river__x}")
        print(f"[listener] delta  -> {ctx.changed}")
        print(f"[listener] keys   -> {structured_changed}")

    return listener


def _configure_hot_reload(
    listener: SettaListener,
    *,
    module_name: str,
    builder_name: str,
    watch_paths: list[str] | None,
    trigger_refresh: bool,
    settle_delay: float | None,
) -> ListenerHotReloader:
    module = importlib.import_module(module_name)
    module_file = getattr(module, "__file__", None)
    if module_file is None:
        raise ValueError(
            f"Listener builder module {module_name!r} does not have a file path"
        )
    paths = {str(Path(module_file).resolve())}
    if watch_paths:
        for raw_path in watch_paths:
            paths.add(str(Path(raw_path).expanduser().resolve()))
    kwargs: dict[str, Any] = {"trigger_refresh": trigger_refresh}
    if settle_delay is not None:
        kwargs["settle_delay"] = settle_delay
    logger.info(
        "Hot reload watching: %s",
        ", ".join(sorted(paths)),
    )
    return ListenerHotReloader(
        listener=listener,
        module_name=module_name,
        builder_name=builder_name,
        paths=paths,
        **kwargs,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manual smoke test for SettaListener persisted updates."
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
        help="Additional files or directories to watch for edits (used with --hot-reload).",
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

    logging.basicConfig(level=logging.INFO)

    project_name = args.project_name or load_default_project_name()
    listener = build_listener(project_name)

    if args.hot_reload:
        reloader = _configure_hot_reload(
            listener,
            module_name=args.builder_module,
            builder_name=args.builder_name,
            watch_paths=args.watch_paths,
            trigger_refresh=not args.no_refresh,
            settle_delay=args.settle_delay,
        )
        logger.info(
            "Hot reload enabled: edit %s to trigger callback refresh.",
            args.builder_module,
        )
        try:
            listener.start_with_hot_reload(reloader)
        except KeyboardInterrupt:
            logger.info("Listener stopped via keyboard interrupt.")
        return

    try:
        listener.start()
    except KeyboardInterrupt:
        logger.info("Listener stopped via keyboard interrupt.")


if __name__ == "__main__":
    main()
