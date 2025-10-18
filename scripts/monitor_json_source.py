#!/usr/bin/env python3
"""Poll a JSON file and print a section snapshot whenever the file changes."""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Monitor a JSON file for changes and print a section or key subset "
            "each time the file is updated."
        )
    )
    parser.add_argument(
        "file",
        type=Path,
        help="Path to the JSON file (e.g. setta_files/setta-settings.json).",
    )
    parser.add_argument(
        "--section",
        metavar="KEY",
        nargs="+",
        default=[],
        help=(
            "Optional path of nested keys identifying the section to report "
            "(e.g. --section gui). Defaults to the root object."
        ),
    )
    parser.add_argument(
        "--keys",
        metavar="KEY",
        nargs="*",
        default=None,
        help=(
            "Optional list of keys within the section to include in the output. "
            "If omitted the entire section is printed."
        ),
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=0.25,
        help="Polling interval in seconds (default: 0.25).",
    )
    return parser.parse_args()


def resolve_section(payload: Any, section_path: List[str]) -> Optional[Any]:
    cursor: Any = payload
    for key in section_path:
        if not isinstance(cursor, dict):
            return None
        cursor = cursor.get(key)
        if cursor is None:
            return None
    return cursor


def filter_keys(section: Any, keys: Optional[List[str]]) -> Any:
    if keys is None or not isinstance(section, dict):
        return section
    return {key: section.get(key) for key in keys}


def format_timestamp(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


def main() -> int:
    args = parse_args()
    target = args.file
    if not target.exists():
        print(f"[monitor_json_source] Waiting for {target} to appear...", file=sys.stderr)

    last_mtime: Optional[float] = None
    last_snapshot: Any = object()

    try:
        while True:
            try:
                stat = target.stat()
            except FileNotFoundError:
                time.sleep(args.interval)
                continue

            if last_mtime != stat.st_mtime:
                try:
                    with target.open("r", encoding="utf-8") as handle:
                        payload = json.load(handle)
                except json.JSONDecodeError as exc:
                    print(
                        f"[monitor_json_source] Failed to parse {target}: {exc}",
                        file=sys.stderr,
                    )
                    time.sleep(args.interval)
                    continue

                section = resolve_section(payload, args.section)
                snapshot = filter_keys(section, args.keys)

                if snapshot != last_snapshot:
                    timestamp = format_timestamp(stat.st_mtime)
                    print(f"\n[{timestamp}] {target}")
                    if args.section:
                        print(f"section: {'/'.join(args.section)}")
                    if args.keys:
                        print(f"keys: {', '.join(args.keys)}")
                    print(json.dumps(snapshot, indent=2, sort_keys=True))
                    last_snapshot = snapshot

                last_mtime = stat.st_mtime

            time.sleep(args.interval)
    except KeyboardInterrupt:
        return 0


if __name__ == "__main__":
    sys.exit(main())
