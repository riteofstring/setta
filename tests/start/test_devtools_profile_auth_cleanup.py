import ast
import sqlite3
import subprocess
import sys
from pathlib import Path


SCRIPT_PATH = (
    Path(__file__).resolve().parents[2]
    / "scripts"
    / "lib"
    / "clear_devtools_profile_auth_cookies.py"
)


def _create_cookie_db(profile_dir: Path) -> Path:
    cookie_db = profile_dir / "Default" / "Cookies"
    cookie_db.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(str(cookie_db))
    try:
        connection.execute(
            """
            CREATE TABLE cookies (
                host_key TEXT NOT NULL,
                name TEXT NOT NULL,
                value TEXT NOT NULL DEFAULT '',
                encrypted_value BLOB NOT NULL DEFAULT X'',
                path TEXT NOT NULL DEFAULT '/'
            )
            """
        )
        connection.commit()
    finally:
        connection.close()
    return cookie_db


def _list_cookie_pairs(cookie_db: Path) -> list[tuple[str, str]]:
    connection = sqlite3.connect(str(cookie_db))
    try:
        rows = connection.execute(
            "SELECT host_key, name FROM cookies ORDER BY host_key, name"
        ).fetchall()
    finally:
        connection.close()
    return [(str(host_key), str(name)) for host_key, name in rows]


def test_cleanup_script_removes_loopback_setta_auth_cookies_only(
    tmp_path: Path,
) -> None:
    profile_dir = tmp_path / "profile"
    cookie_db = _create_cookie_db(profile_dir)
    connection = sqlite3.connect(str(cookie_db))
    try:
        connection.executemany(
            "INSERT INTO cookies (host_key, name, value, encrypted_value, path) VALUES (?, ?, '', X'', '/')",
            [
                ("127.0.0.1", "setta_auth_deadbeef_aaaaaa"),
                ("127.0.0.1", "setta_auth_setta.pixijs-graph_bbbbbb"),
                ("localhost", "setta_auth"),
                (".localhost", "setta_auth_setta_cccccc"),
                ("127.0.0.1", "shareSessionId"),
                ("example.com", "setta_auth_foreign_dddddd"),
            ],
        )
        connection.commit()
    finally:
        connection.close()

    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--profile-dir", str(profile_dir)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert "Removed 4 loopback Setta auth cookies" in result.stderr
    assert _list_cookie_pairs(cookie_db) == [
        ("127.0.0.1", "shareSessionId"),
        ("example.com", "setta_auth_foreign_dddddd"),
    ]


def test_cleanup_script_parses_with_python39_grammar() -> None:
    source = SCRIPT_PATH.read_text(encoding="utf-8")
    ast.parse(source, filename=str(SCRIPT_PATH), feature_version=(3, 9))


def test_cleanup_script_is_noop_when_cookie_db_is_missing(tmp_path: Path) -> None:
    profile_dir = tmp_path / "profile"

    result = subprocess.run(
        [sys.executable, str(SCRIPT_PATH), "--profile-dir", str(profile_dir)],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode == 0
    assert result.stderr == ""
