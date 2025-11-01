"""
Manual SettaListener smoke-check script used by docs/setta-listener-plan.md.

Run this once the dev stack is up (frontend + backend) to verify that the
listener receives persisted updates when a control changes in the UI.
"""

import argparse
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
sys.path.insert(0, BACKEND_PATH)

from setta.api import SettaListener


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


def load_default_project_identifiers() -> tuple[str, str]:
    """Read the fixture project id and name that ship with the repository."""
    data = json.loads(Path("setta_files/project.json").read_text())
    project_id = data["defaultProjectConfigId"]
    project_config = data["projectConfigs"][project_id]
    return project_id, project_config["name"]


def build_listener(project_name: str, project_id: str | None) -> SettaListener:
    """Wire the example callback that watches the Channel Shuffle groups param."""
    listener = SettaListener(
        project_name=project_name,
        project_id=project_id,
    )

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


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Manual smoke test for SettaListener persisted updates."
    )
    parser.add_argument(
        "--project-name",
        default=None,
        help=(
            "Override the project config name to watch (defaults to repository fixture)."
        ),
    )
    parser.add_argument(
        "--project-id",
        default=None,
        help=("Optionally provide a project config id hint to skip name resolution."),
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    default_project_id, default_project_name = load_default_project_identifiers()
    project_name = args.project_name or default_project_name
    if args.project_id:
        project_id_hint = args.project_id
    elif project_name == default_project_name:
        project_id_hint = default_project_id
    else:
        project_id_hint = None

    listener = build_listener(project_name, project_id_hint)

    try:
        listener.start()
    except KeyboardInterrupt:
        logging.info("Listener stopped via keyboard interrupt.")


if __name__ == "__main__":
    main()
