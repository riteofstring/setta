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


def load_default_project_id() -> str:
    """Read the project config id that ships with the repository fixtures."""
    data = json.loads(Path("setta_files/project.json").read_text())
    return data["defaultProjectConfigId"]


def build_listener(project_id: str) -> SettaListener:
    """Wire the example callback that watches the Channel Shuffle groups param."""
    listener = SettaListener(project_id=project_id)

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
        "--project-id",
        default=None,
        help="Override the project config to watch (defaults to repository fixture).",
    )
    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    project_id = args.project_id or load_default_project_id()
    listener = build_listener(project_id)

    try:
        listener.start()
    except KeyboardInterrupt:
        logging.info("Listener stopped via keyboard interrupt.")


if __name__ == "__main__":
    main()
