#!/usr/bin/env python3

import argparse
import sqlite3
import sys
from pathlib import Path
from typing import Optional

_COOKIE_DB_RELATIVE_PATH = Path("Default") / "Cookies"
_LOOPBACK_HOST_KEYS = ("127.0.0.1", "localhost", ".localhost")
_AUTH_COOKIE_EXACT_NAME = "setta_auth"
_AUTH_COOKIE_PREFIX = "setta_auth_"


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Remove stale loopback Setta auth cookies from a dedicated "
            "Chrome DevTools profile before bootstrap."
        )
    )
    parser.add_argument(
        "--profile-dir",
        required=True,
        help="Path to the dedicated Chrome user-data-dir root.",
    )
    return parser


def _cookie_db_path(profile_dir: Path) -> Path:
    return profile_dir / _COOKIE_DB_RELATIVE_PATH


def _is_setta_auth_cookie(name: str) -> bool:
    return name == _AUTH_COOKIE_EXACT_NAME or name.startswith(_AUTH_COOKIE_PREFIX)


def clear_profile_auth_cookies(profile_dir: Path) -> int:
    cookie_db = _cookie_db_path(profile_dir)
    if not cookie_db.is_file():
        return 0

    connection = sqlite3.connect(str(cookie_db))
    try:
        rows = connection.execute(
            """
            SELECT rowid, name
            FROM cookies
            WHERE host_key IN (?, ?, ?)
            """,
            _LOOPBACK_HOST_KEYS,
        ).fetchall()
        row_ids_to_delete = [
            row_id
            for row_id, name in rows
            if isinstance(name, str) and _is_setta_auth_cookie(name)
        ]
        if not row_ids_to_delete:
            return 0
        connection.executemany(
            "DELETE FROM cookies WHERE rowid = ?",
            [(row_id,) for row_id in row_ids_to_delete],
        )
        connection.commit()
        return len(row_ids_to_delete)
    finally:
        connection.close()


def main(argv: Optional[list[str]] = None) -> int:
    parser = _build_parser()
    args = parser.parse_args(argv)
    removed_count = clear_profile_auth_cookies(Path(args.profile_dir))
    if removed_count > 0:
        print(
            "Removed "
            f"{removed_count} loopback Setta auth cookies from {args.profile_dir}",
            file=sys.stderr,
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
