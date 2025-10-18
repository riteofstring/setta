import asyncio
import logging
import os
import sys
from pathlib import Path

import click
import uvicorn

from . import __version__
from .utils.constants import C
from .websockets.connect import connect as _connect


@click.command()
@click.argument("websocket_id", required=False)
@click.option("--host", default=C.DEFAULT_HOST, help="backend host")
@click.option("--port", default=C.DEFAULT_PORT, help="backend port")
def connect(websocket_id, host, port):
    C.HOST = host
    C.PORT = port
    asyncio.run(_connect(websocket_id))


@click.command()
def version():
    print(f"setta version {__version__}")


@click.command()
@click.option("--readable", is_flag=True, help="Export in human-readable format")
@click.option(
    "--readable-with-variants",
    is_flag=True,
    help="Export in readable format with variants",
)
def export_db(readable, readable_with_variants):
    if not any([readable, readable_with_variants]):
        readable_with_variants = True

    # TODO


@click.group(
    invoke_without_command=True,
    context_settings=dict(
        ignore_unknown_options=True,
    ),
)
@click.option("--reload", is_flag=True)
@click.option("--host", default=C.DEFAULT_HOST, help="backend host")
@click.option("--port", default=C.DEFAULT_PORT, help="backend port")
@click.option(
    "--log-level",
    type=click.Choice(
        ["critical", "error", "warning", "info", "debug"], case_sensitive=False
    ),
    default="critical",
    help="Set the logging level",
)
@click.pass_context
def cli(ctx, reload, host: str, port: int, log_level):
    if ctx.invoked_subcommand is None:
        print("Starting Setta", flush=True)

        C.HOST = host
        C.PORT = port

        sys.path.append(str(Path(__file__).resolve().parent))

        logging.basicConfig(
            level=getattr(logging, log_level.upper()),
            format="%(levelname)s - %(asctime)s - %(name)s - %(message)s",
        )

        if os.getenv("SETTA_SUPPRESS_PRINTS"):
            import builtins

            _orig_print = builtins.print

            def _suppressed_print(*args, **kwargs):
                if kwargs.pop("_force", False):
                    return _orig_print(*args, **kwargs)
                return None

            builtins.print = _suppressed_print
            logging.getLogger(__name__).info(
                "Console print statements suppressed (SETTA_SUPPRESS_PRINTS set)."
            )

        module_filter_env = os.getenv("SETTA_DEBUG_MODULE_FILTER")
        if module_filter_env:

            class _ModuleFilter(logging.Filter):
                def __init__(self, tokens: list[str]):
                    super().__init__()
                    self.tokens = [t.casefold() for t in tokens]

                def filter(self, record: logging.LogRecord) -> bool:
                    if record.levelno > logging.DEBUG:
                        return True
                    record_name = record.name.casefold()
                    return any(
                        record_name.startswith(token) or token in record_name
                        for token in self.tokens
                    )

            prefixes = [
                token.strip()
                for token in module_filter_env.replace(" ", "").split(",")
                if token.strip()
            ]
            if prefixes:
                root_logger = logging.getLogger()
                module_filter = _ModuleFilter(prefixes)
                root_logger.addFilter(module_filter)
                for handler in root_logger.handlers:
                    handler.addFilter(module_filter)
                logging.getLogger(__name__).info(
                    "Applying debug module filter for: %s", prefixes
                )
        section_filter_env = os.getenv("SETTA_DEBUG_SECTION_FILTER")
        if section_filter_env:
            section_tokens = [
                token.strip()
                for token in section_filter_env.split(",")
                if token.strip()
            ]
            if section_tokens:
                logging.getLogger(__name__).info(
                    "Filtering jsonSource debug sections: %s", section_tokens
                )

        overrides_env = os.getenv("SETTA_LOGGER_LEVEL_OVERRIDES")
        if overrides_env:

            def _parse_override(token: str) -> tuple[str, int] | None:
                name, _, level = token.partition("=")
                name = name.strip()
                level = level.strip().upper() or "WARNING"
                if not name:
                    return None
                numeric_level = logging.getLevelName(level)
                if isinstance(numeric_level, str):
                    logging.getLogger(__name__).warning(
                        "Ignoring invalid log level '%s' for logger '%s'",
                        level,
                        name,
                    )
                    return None
                return name, numeric_level

            parsed_overrides = []
            for raw_token in overrides_env.split(","):
                token = raw_token.strip()
                if not token:
                    continue
                parsed = _parse_override(token)
                if parsed:
                    parsed_overrides.append(parsed)

            if parsed_overrides:
                for logger_name, level_value in parsed_overrides:
                    logging.getLogger(logger_name).setLevel(level_value)
                logging.getLogger(__name__).info(
                    "Adjusted log levels: %s",
                    [
                        f"{name}={logging.getLevelName(level)}"
                        for name, level in parsed_overrides
                    ],
                )

        config = uvicorn.Config(
            "server:app",
            host=host,
            port=port,
            log_level=os.getenv("UVICORN_LOG_LEVEL", log_level),
            reload=reload,
            timeout_graceful_shutdown=1,
        )
        server = uvicorn.Server(config)

        server.run()


cli.add_command(connect)
cli.add_command(version)
cli.add_command(export_db)
