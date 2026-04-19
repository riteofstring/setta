#!/usr/bin/env python3

import importlib
import json
import os
import shlex
import shutil
import sys
from pathlib import Path

BACKEND_PROBE_ARG = "--setta-plugin-backend-probe"
LSP_COMMAND_ENV = "SETTA_LSP_COMMAND"
LSP_ARGS_ENV = "SETTA_LSP_ARGS"


def fail(message: str) -> None:
    sys.stderr.write(message.strip() + "\n")
    raise SystemExit(1)


def resolve_command(candidate: str) -> str:
    if os.path.sep in candidate or (os.path.altsep and os.path.altsep in candidate):
        command_path = Path(candidate).expanduser()
        validation_path = (
            command_path.resolve() if command_path.is_absolute() else command_path
        )
        if not validation_path.is_file():
            fail(f'resolve command "{candidate}": not found')
        if not os.access(validation_path, os.X_OK):
            fail(f'resolve command "{candidate}": not executable')
        return str(command_path)
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
            args = split_language_server_args(raw_args)
        return resolve_command(explicit_command), args
    ensure_default_interpreter_supports_ty()
    return sys.executable, ["-m", "ty", "server"]


def split_language_server_args(raw_args: str, platform: str | None = None) -> list[str]:
    active_platform = os.name if platform is None else platform
    if active_platform == "nt":
        return split_windows_command_line(raw_args)
    return shlex.split(raw_args)


def split_windows_command_line(command_line: str) -> list[str]:
    args: list[str] = []
    length = len(command_line)
    index = 0

    while index < length:
        while index < length and command_line[index].isspace():
            index += 1
        if index >= length:
            break

        current: list[str] = []
        in_quotes = False
        while index < length:
            char = command_line[index]
            if char.isspace() and not in_quotes:
                break
            if char == "\\":
                index, in_quotes = consume_windows_backslashes(
                    command_line, index, current, in_quotes
                )
                continue
            if char == '"':
                index, in_quotes = consume_windows_quote(
                    command_line, index, current, in_quotes
                )
                continue
            current.append(char)
            index += 1

        args.append("".join(current))
        while index < length and command_line[index].isspace():
            index += 1

    return args


def consume_windows_backslashes(
    command_line: str, index: int, current: list[str], in_quotes: bool
) -> tuple[int, bool]:
    slash_start = index
    length = len(command_line)
    while index < length and command_line[index] == "\\":
        index += 1
    slash_count = index - slash_start
    if index < length and command_line[index] == '"':
        current.append("\\" * (slash_count // 2))
        if slash_count % 2 == 0:
            return index + 1, not in_quotes
        current.append('"')
        return index + 1, in_quotes
    current.append("\\" * slash_count)
    return index, in_quotes


def consume_windows_quote(
    command_line: str, index: int, current: list[str], in_quotes: bool
) -> tuple[int, bool]:
    if in_quotes and index + 1 < len(command_line) and command_line[index + 1] == '"':
        current.append('"')
        return index + 2, in_quotes
    return index + 1, not in_quotes


def ensure_default_interpreter_supports_ty() -> None:
    try:
        importlib.import_module("ty")
    except Exception as exc:
        fail(f"default interpreter {sys.executable!r} cannot import ty: {exc}")


def main() -> None:
    if len(sys.argv) != 2 or sys.argv[1] != BACKEND_PROBE_ARG:
        return

    command, args = resolve_language_server_command()
    json.dump(
        {
            "schemaVersion": 1,
            "languageServers": [
                {
                    "name": "ty",
                    "language": "python",
                    "command": command,
                    "args": args,
                    "settingsKey": "ty",
                }
            ],
        },
        sys.stdout,
    )
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
