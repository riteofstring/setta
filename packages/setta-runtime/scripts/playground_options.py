from __future__ import annotations

import argparse
import sys
import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PlaygroundOptions:
    workspace: Path
    no_open: bool


def parse_options(
    app: str, default_workspace: Path, arguments: Sequence[str] | None
) -> PlaygroundOptions | int:
    parser = argparse.ArgumentParser(
        prog=f"pnpm {app}:playground",
        description="Open an editable example. Previous experiments are preserved.",
    )
    parser.add_argument(
        "--no-open", action="store_true", help="print the URL without opening a browser"
    )
    destination = parser.add_mutually_exclusive_group()
    destination.add_argument(
        "--fresh",
        action="store_true",
        help="start a new copy, keeping all previous work",
    )
    destination.add_argument(
        "--workspace", type=Path, help="open or seed an example in this directory"
    )
    try:
        parsed = parser.parse_args(arguments)
    except SystemExit as error:
        return int(error.code or 0)
    workspace = default_workspace
    if parsed.fresh:
        workspace = workspace.with_name(f"{workspace.name}-{uuid.uuid4().hex[:8]}")
    elif parsed.workspace is not None:
        workspace = parsed.workspace.expanduser().resolve()
    return PlaygroundOptions(workspace=workspace, no_open=parsed.no_open)


def announce(app: str, workspace: Path) -> None:
    sys.stdout.write(
        f"\nOpening {app} playground. Look for Start here in the left sidebar.\n"
        f"Your working copy: {workspace}\n"
        f'Resume this copy: pnpm {app}:playground --workspace "{workspace}"\n'
        f"Start another: pnpm {app}:playground --fresh\n"
        "The first launch may take a few minutes to build the apps.\n"
        "Keep this terminal open; press Ctrl-C to stop.\n\n"
    )
    sys.stdout.flush()


def report_error(app: str, error: Exception) -> None:
    sys.stderr.write(
        f"{app} playground: {error}\n"
        f"To try an untouched example, run pnpm {app}:playground --fresh.\n"
        "Your existing working copy has not been replaced.\n"
    )
