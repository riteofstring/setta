from pathlib import Path
import logging
import os
import sys
import warnings

_ROOT_DIR = Path(__file__).resolve().parents[1]
_BACKEND_PATH = str(_ROOT_DIR / "backend")
if _BACKEND_PATH not in sys.path:
    sys.path.insert(0, _BACKEND_PATH)


class _IgnoreAsyncioSlowCallback(logging.Filter):
    """Filter out asyncio slow-callback warnings during tests."""

    def filter(self, record: logging.LogRecord) -> bool:
        return "Executing <Task" not in record.getMessage()


_TEST_LOG_LEVEL_ENV = "SETTA_TEST_LOG_LEVEL"
_DEFAULT_TEST_LOG_LEVEL = "CRITICAL"
_test_log_level_name = os.environ.get(
    _TEST_LOG_LEVEL_ENV, _DEFAULT_TEST_LOG_LEVEL
).upper()
_test_log_level = logging.getLevelName(_test_log_level_name)
if not isinstance(_test_log_level, int):
    _test_log_level = logging.ERROR

os.environ.setdefault("SETTA_LOG_LEVEL", _test_log_level_name)
os.environ.setdefault("SETTA_LISTENER_LOG_LEVEL", _test_log_level_name)
os.environ.setdefault("SETTA_UI_LOG_LEVEL", "ERROR")
_suppress_output = _test_log_level >= logging.ERROR


def _silence_logger(name: str) -> None:
    logger = logging.getLogger(name)
    logger.setLevel(_test_log_level)
    if _suppress_output:
        logger.propagate = False
        if not logger.handlers:
            logger.addHandler(logging.NullHandler())


_silence_logger("bm25s")
_silence_logger("setta")
_silence_logger("tests.logging.errors")
_silence_logger("claude_agent_sdk")
_silence_logger("claude_agent_sdk.subprocess_cli")
_silence_logger("websockets")
_silence_logger("websockets.client")
_silence_logger("websockets.server")
_silence_logger("mcp")
_silence_logger("mcp.server")
_silence_logger("mcp.server.fastmcp")
_silence_logger("mcp.server.streamable_http")
_silence_logger("mcp.server.streamable_http_manager")
_silence_logger("anyio")

logging.getLogger().setLevel(_test_log_level)
logging.getLogger("asyncio").addFilter(_IgnoreAsyncioSlowCallback())
logging.getLogger("asyncio").setLevel(_test_log_level)

if _suppress_output and logging.lastResort is not None:
    logging.lastResort.setLevel(_test_log_level)

def apply_warning_filters() -> None:
    warnings.filterwarnings(
        "ignore",
        message=(
            r"^enable_cleanup_closed ignored because https://github.com/python/cpython/pull/118960 is fixed"
        ),
        category=DeprecationWarning,
    )
    warnings.filterwarnings(
        "ignore",
        message=r"^This process .* use of forkpty\\(\\) may lead to deadlocks in the child\\.$",
        category=DeprecationWarning,
    )
    warnings.filterwarnings(
        "ignore",
        message=r"^unclosed transport ",
        category=ResourceWarning,
    )


apply_warning_filters()
