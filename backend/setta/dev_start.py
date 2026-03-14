"""Explicit dev-only backend start entrypoint for source workflows."""

import argparse
import logging
import os
import sys
from pathlib import Path

import click

from setta.auth.manager import BOOTSTRAP_TOKEN_MANAGER
from setta.logging.config import configure_logging
from setta.sessions import SessionRegistry
from setta.sessions.constants import SESSION_ID_ENV_VAR, SESSIONS_ROOT_ENV_VAR
from setta.startup_runtime import (
    _apply_paths_to_env,
    _is_ssh_session,
    _render_startup_message,
    _resolve_cli_paths,
    _resolve_port,
    _run_uvicorn_server,
    _should_auto_open,
)
from setta.utils.constants import C
from setta.utils.network import build_bootstrap_urls
from setta.utils.user_config import ensure_setta_user_config_exists


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="python -m setta.dev_start",
        description="Start the Setta backend for source/dev workflows.",
    )
    parser.add_argument("--reload", action="store_true")
    parser.add_argument("--host", default=C.DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=None)
    parser.add_argument("--workspace", type=Path, default=None)
    parser.add_argument("--profile", default=None)
    parser.add_argument("--setta-home", type=Path, default=None)
    parser.add_argument("--setta-files-root", type=Path, default=None)
    parser.add_argument(
        "--setta-files-location",
        choices=("auto", "local", "global"),
        default=None,
    )
    parser.add_argument("--runtime-root", type=Path, default=None)
    parser.add_argument(
        "--log-level",
        choices=("critical", "error", "warning", "info", "debug"),
        default=None,
    )
    parser.add_argument("--no-open", action="store_true")
    return parser


def run(args: argparse.Namespace) -> int:
    paths = _resolve_cli_paths(
        workspace=args.workspace,
        setta_home=args.setta_home,
        profile=args.profile,
        setta_files_root=args.setta_files_root,
        setta_files_location=args.setta_files_location,
        runtime_root=args.runtime_root,
        validate=True,
    )
    _apply_paths_to_env(paths)

    config_error = ensure_setta_user_config_exists(setta_home=paths.setta_home)
    if config_error:
        logging.getLogger(__name__).warning(config_error)

    resolved_log_level = configure_logging(level_override=args.log_level)
    uvicorn_log_level = logging.getLevelName(resolved_log_level).lower()
    logging.getLogger(__name__).info("Starting Setta")

    resolved_host = args.host
    resolved_port = _resolve_port(resolved_host, args.port)
    C.HOST = resolved_host
    C.PORT = resolved_port

    sessions_root = paths.runtime_sessions_root
    registry = SessionRegistry(sessions_root=sessions_root)
    display_workspace = args.workspace or paths.workspace_root
    session = registry.create_session(
        paths.workspace_root,
        resolved_host,
        resolved_port,
        os.getpid(),
        workspace_display_path=str(display_workspace),
        setta_files_location=paths.setta_files_location,
        setta_files_root=str(paths.setta_files_root),
        runtime_root=str(paths.runtime_root),
        setta_home=str(paths.setta_home),
        profile=paths.profile_name,
        server_mode="launcher" if C.LAUNCHER_MODE else "ide",
    )
    os.environ[SESSION_ID_ENV_VAR] = session.id
    os.environ[SESSIONS_ROOT_ENV_VAR] = str(sessions_root)
    secret = registry.load_secret(session)
    token = BOOTSTRAP_TOKEN_MANAGER.mint(session.id, secret)

    bootstrap_url_fragment, bootstrap_url_plain = build_bootstrap_urls(
        resolved_host, resolved_port, token
    )
    auto_open = _should_auto_open(args.no_open)
    C.OPEN_BROWSER_ON_START = bootstrap_url_fragment if auto_open else None

    print(
        _render_startup_message(
            session.id,
            resolved_host,
            resolved_port,
            Path(session.workspacePathCanonical),
            bootstrap_url_fragment,
            bootstrap_url_plain,
            token,
            auto_open,
            _is_ssh_session(),
        )
    )

    import uvicorn

    config = uvicorn.Config(
        "setta.server:app",
        host=resolved_host,
        port=resolved_port,
        log_level=uvicorn_log_level,
        log_config=None,
        reload=args.reload,
        timeout_graceful_shutdown=1,
    )
    server = uvicorn.Server(config)
    _run_uvicorn_server(server)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(sys.argv[1:] if argv is None else argv)
    try:
        return run(args)
    except click.ClickException as exc:
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
