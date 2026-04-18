#!/usr/bin/env python3

import json
import os
import shlex
import shutil
import sys
from pathlib import Path

BACKEND_PROBE_ARG = "--setta-plugin-backend-probe"
LSP_COMMAND_ENV = "SETTA_LSP_COMMAND"
LSP_ARGS_ENV = "SETTA_LSP_ARGS"
BASEDPYRIGHT_ENTRYPOINT = "from basedpyright.langserver import main; main()"


def fail(message: str) -> None:
    sys.stderr.write(message.strip() + "\n")
    raise SystemExit(1)


def resolve_command(candidate: str) -> str:
    if os.path.sep in candidate or (os.path.altsep and os.path.altsep in candidate):
        return str(Path(candidate).expanduser().resolve())
    resolved = shutil.which(candidate)
    if resolved is None:
        fail(f'resolve command "{candidate}": not found')
    return resolved


def resolve_language_server_command() -> tuple[str, list[str]]:
    explicit_command = os.getenv(LSP_COMMAND_ENV, "").strip()
    if explicit_command:
        args = []
        raw_args = os.getenv(LSP_ARGS_ENV, "").strip()
        if raw_args:
            args = shlex.split(raw_args)
        return resolve_command(explicit_command), args
    return sys.executable, ["-c", BASEDPYRIGHT_ENTRYPOINT, "--stdio"]


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] != BACKEND_PROBE_ARG:
        return

    command, args = resolve_language_server_command()
    json.dump(
        {
            "schemaVersion": 1,
            "languageServers": [
                {
                    "name": "basedpyright",
                    "language": "python",
                    "command": command,
                    "args": args,
                    "settingsKey": "basedpyright",
                }
            ],
        },
        sys.stdout,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
