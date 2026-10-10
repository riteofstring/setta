from __future__ import annotations

import argparse
import sys
import uuid
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class PlaygroundOptions:
    workspace: Path
    no_open: bool
    stop: bool
    example: str | None = None


def parse_options(
    app: str,
    default_workspace: Path,
    arguments: Sequence[str] | None,
    examples: Mapping[str, Path] | None = None,
) -> PlaygroundOptions | int:
    parser = argparse.ArgumentParser(
        prog=f"pnpm {app}:playground",
        description="Open an editable example. Previous experiments are preserved.",
    )
    if examples:
        parser.add_argument(
            "--example",
            choices=tuple(examples),
            default=next(iter(examples)),
            help="choose an experiment; each has its own saved working copy",
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
    example = parsed.example if examples else None
    workspace = examples[example] if examples and example else default_workspace
    if parsed.fresh:
        workspace = workspace.with_name(f"{workspace.name}-{uuid.uuid4().hex[:8]}")
    elif parsed.workspace is not None:
        workspace = parsed.workspace.expanduser().resolve()
    return PlaygroundOptions(
        workspace=workspace, no_open=parsed.no_open, stop=parsed.stop, example=example
    )


def announce(app: str, workspace: Path, url: str, example: str | None = None) -> None:
    command = f"pnpm {app}:playground"
    if example:
        command += f" --example {example}"
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
