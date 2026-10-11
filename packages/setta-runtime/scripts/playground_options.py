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
    stop: bool


def parse_options(
    app: str,
    default_workspace: Path,
    arguments: Sequence[str] | None,
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
    parser.add_argument(
        "--stop", action="store_true", help="stop this playground, keeping your work"
    )
    try:
        parsed = parser.parse_args(arguments)
        if parsed.stop and parsed.fresh:
            parser.error("--stop selects an existing copy; omit --fresh")
    except SystemExit as error:
        return int(error.code or 0)
    workspace = default_workspace
    if parsed.fresh:
        workspace = workspace.with_name(f"{workspace.name}-{uuid.uuid4().hex[:8]}")
    elif parsed.workspace is not None:
        workspace = parsed.workspace.expanduser().resolve()
    return PlaygroundOptions(
        workspace=workspace, no_open=parsed.no_open, stop=parsed.stop
    )


def announce(app: str, workspace: Path, url: str) -> None:
    command = f"pnpm {app}:playground"
    sys.stdout.write(
        f"\n{app} playground is ready: {url}\n"
        "Look for Start here in the left sidebar.\n"
        f"Your working copy: {workspace}\n"
        f'Resume this copy: {command} --workspace "{workspace}"\n'
        f"Start another: {command} --fresh\n"
        "You can close this terminal; the playground keeps running.\n"
        f'Stop this copy: {command} --workspace "{workspace}" --stop\n\n'
    )
    sys.stdout.flush()
