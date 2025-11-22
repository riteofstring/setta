import logging
import os
import shutil
import subprocess
import time
from pathlib import Path
from socket import create_connection
from urllib.error import URLError
from urllib.parse import urlparse
from urllib.request import urlopen

from setta.llm.config_store import DEFAULT_GATEWAY_URL

logger = logging.getLogger(__name__)

_SKIP_ENV_VAR = "SETTA_SKIP_LOCAL_GATEWAY"
_HEALTH_POLL_SECONDS = 0.5
_STARTUP_TIMEOUT_SECONDS = 20.0
_BUNDLED_GATEWAY_DIR = (
    Path(__file__).resolve().parent.parent / "static" / "portkey_gateway"
)
_BUNDLED_GATEWAY_START = _BUNDLED_GATEWAY_DIR / "build" / "start-server.js"
_BUNDLED_GATEWAY_DEPS = ("@hono/node-server", "hono")


def has_bundled_gateway() -> bool:
    """Return True when the Portkey gateway bundle is present in the package."""

    return (
        _BUNDLED_GATEWAY_START.exists()
        and (_BUNDLED_GATEWAY_DIR / "package.json").exists()
        and _bundled_gateway_dependencies_present()
    )


def bundled_gateway_path() -> Path:
    """Path to the packaged Portkey gateway bundle."""

    return _BUNDLED_GATEWAY_DIR


class DevGatewayManager:
    """Minimal helper that boots the local Portkey gateway during development."""

    def __init__(
        self,
        *,
        gateway_url: str = DEFAULT_GATEWAY_URL,
        frontend_dir: Path | None = None,
        startup_timeout: float = _STARTUP_TIMEOUT_SECONDS,
    ) -> None:
        self._gateway_url = gateway_url.rstrip("/")
        self._frontend_dir = frontend_dir or _default_frontend_dir()
        self._startup_timeout = startup_timeout
        self._process: subprocess.Popen[str] | None = None
        self._skip = bool(os.environ.get(_SKIP_ENV_VAR))
        self._node_path = shutil.which("node")
        self._pnpm_path = shutil.which("pnpm")
        self._bundled_gateway_dir = (
            _BUNDLED_GATEWAY_DIR if has_bundled_gateway() else None
        )

    def ensure_running(self) -> None:
        if self._skip:
            logger.info("Skipping local Portkey gateway (%s is set).", _SKIP_ENV_VAR)
            return

        if self._is_healthy():
            logger.info("Portkey gateway already healthy at %s.", self._gateway_url)
            return

        self._process = self._launch_gateway()
        self._wait_for_health()

    def stop(self) -> None:
        if not self._process:
            return
        if self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self._process.kill()
        self._process = None

    def _launch_gateway(self) -> subprocess.Popen[str]:
        if self._bundled_gateway_dir:
            return self._launch_bundled_gateway()
        return self._launch_gateway_via_pnpm()

    def _launch_bundled_gateway(self) -> subprocess.Popen[str]:
        if not self._node_path:
            raise RuntimeError(
                "Node.js is required to launch the bundled Portkey gateway."
            )

        if not has_bundled_gateway():
            raise RuntimeError("Bundled Portkey gateway assets are missing.")

        logger.info(
            "Starting bundled Portkey gateway from %s.", self._bundled_gateway_dir
        )
        env = os.environ.copy()
        env.setdefault("NODE_ENV", "production")
        try:
            return subprocess.Popen(
                [self._node_path, str(_BUNDLED_GATEWAY_START)],
                cwd=str(self._bundled_gateway_dir),
                env=env,
            )
        except OSError as exc:
            raise RuntimeError("Failed to start the bundled Portkey gateway.") from exc

    def _launch_gateway_via_pnpm(self) -> subprocess.Popen[str]:
        if not self._pnpm_path:
            raise RuntimeError("pnpm is required to launch the Portkey gateway.")

        package_json = self._frontend_dir / "package.json"
        if not package_json.exists():
            raise RuntimeError(
                f"Cannot locate frontend workspace at {self._frontend_dir}."
            )

        command = [self._pnpm_path, "exec", "--", "gateway"]
        logger.info("Starting local Portkey gateway via `pnpm exec gateway`.")
        try:
            return subprocess.Popen(command, cwd=str(self._frontend_dir))
        except OSError as exc:
            raise RuntimeError("Failed to start the Portkey gateway.") from exc

    def _wait_for_health(self) -> None:
        deadline = time.monotonic() + self._startup_timeout
        while time.monotonic() < deadline:
            if self._is_healthy():
                logger.info("Local Portkey gateway is ready at %s.", self._gateway_url)
                return
            if self._process and self._process.poll() is not None:
                raise RuntimeError("Portkey gateway exited before becoming healthy.")
            time.sleep(_HEALTH_POLL_SECONDS)
        raise RuntimeError(
            f"Portkey gateway did not become healthy within {self._startup_timeout} seconds."
        )

    def _is_healthy(self) -> bool:
        normalized = self._gateway_url.rstrip("/")
        for path in ("v1/health", "portkey-ai/gateway/health"):
            if _check_health(f"{normalized}/{path}"):
                return True
        return _check_socket(self._gateway_url)


def _check_health(url: str) -> bool:
    try:
        with urlopen(url, timeout=2) as response:
            return 200 <= response.getcode() < 300
    except URLError:
        return False


def _check_socket(base_url: str) -> bool:
    parsed = urlparse(base_url)
    host = parsed.hostname or "127.0.0.1"
    port = parsed.port or 80
    try:
        with create_connection((host, port), timeout=1):
            return True
    except OSError:
        return False


def _default_frontend_dir() -> Path:
    project_root = Path(__file__).resolve().parents[3]
    return project_root / "frontend"


def _bundled_gateway_dependencies_present() -> bool:
    node_modules = _BUNDLED_GATEWAY_DIR / "node_modules"
    if not node_modules.exists():
        return False

    for dependency in _BUNDLED_GATEWAY_DEPS:
        if not (node_modules / dependency / "package.json").exists():
            return False

    return True
