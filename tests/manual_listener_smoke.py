"""
Manual SettaListener smoke-check script used by docs/setta-listener-plan.md.

Run this once the dev stack is up (frontend + backend) to verify that the
listener receives persisted updates when a control changes in the UI.
"""

import argparse
import json
import logging
from pathlib import Path
from typing import Any

from setta.api import SettaListener


def load_default_project_id() -> str:
    """Read the project config id that ships with the repository fixtures."""
    data = json.loads(Path("setta_files/project.json").read_text())
    return data["defaultProjectConfigId"]


def build_listener(project_id: str) -> SettaListener:
    """Wire the example callback that watches the Channel Shuffle groups param."""
    listener = SettaListener(project_id=project_id)

    @listener.listen(deps=["coding_sand__groups"])
    def on_groups_change(state: Any, ctx: Any) -> None:
        print(f"[listener] groups -> {state.coding_sand__groups}")
        print(f"[listener] delta  -> {ctx.changed}")

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
