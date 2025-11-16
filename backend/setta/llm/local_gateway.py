"""Lifecycle management for the bundled Portkey gateway."""

import json
import logging
import os
import shlex
import subprocess
import time
from pathlib import Path
from typing import Sequence
from urllib.parse import urlparse

import requests
from requests import RequestException

from setta.llm.config_store import LLMConfig

LOGGER = logging.getLogger(__name__)

DEFAULT_LOCAL_HOSTS = {"127.0.0.1", "localhost"}
DEFAULT_LOCAL_GATEWAY_PORT = 8787
BUNDLED_GATEWAY_DIR = Path(__file__).resolve().parent.parent / "static" / "portkey_gateway"
ENV_DISABLE_BUNDLED_GATEWAY = "SETTA_DISABLE_LOCAL_GATEWAY"
ENV_OVERRIDE_COMMAND = "SETTA_LOCAL_GATEWAY_COMMAND"
ENV_NODE_EXECUTABLE = "SETTA_NODE_EXECUTABLE"
HEALTH_TIMEOUT_SECONDS = 30.0
HEALTH_POLL_INTERVAL_SECONDS = 0.5
STOP_TIMEOUT_SECONDS = 10.0


class BundledGatewayLifecycle:
    """Start/stop helper around the vendored Portkey gateway bundle."""

    def __init__(
        self,
        gateway_url: str,
        *,
        bundle_root: Path | None = None,
    ) -> None:
        self._gateway_url = gateway_url
        self._bundle_root = bundle_root or BUNDLED_GATEWAY_DIR
        self._process: subprocess.Popen[str] | None = None

    def start(self, timeout: float = HEALTH_TIMEOUT_SECONDS) -> None:
        if self._process:
            return
        command = _resolve_gateway_command(self._bundle_root)
        env = os.environ.copy()
        LOGGER.info("Starting bundled Portkey gateway: %s", " ".join(command))
        try:
            self._process = subprocess.Popen(
                command,
                cwd=str(self._bundle_root),
                env=env,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "Unable to start the bundled Portkey gateway. "
                "Ensure Node.js is installed and available on PATH."
            ) from exc

        try:
            _wait_for_gateway_health(
                health_urls=tuple(_gateway_health_candidates(self._gateway_url)),
                timeout=timeout,
                process=self._process,
            )
        except Exception:
            self.stop(force=True)
            raise

    def stop(self, *, force: bool = False, timeout: float = STOP_TIMEOUT_SECONDS) -> None:
        process = self._process
        if not process:
            return
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout)
            except subprocess.TimeoutExpired:
                LOGGER.warning("Bundled Portkey gateway did not exit after terminate.")
                if force:
                    process.kill()
                    process.wait(5)
        self._process = None

    def is_running(self) -> bool:
        return self._process is not None and self._process.poll() is None


def should_start_local_gateway(llm_config: LLMConfig) -> bool:
    """Return True when the bundled gateway should be launched automatically."""

    if os.environ.get(ENV_DISABLE_BUNDLED_GATEWAY):
        return False

    parsed = urlparse(llm_config.gateway_url)
    host = (parsed.hostname or "").lower()
    if host not in DEFAULT_LOCAL_HOSTS:
        return False
    port = parsed.port or _default_port_for_scheme(parsed.scheme)
    if port != DEFAULT_LOCAL_GATEWAY_PORT:
        return False
    return True


def _default_port_for_scheme(scheme: str) -> int:
    if scheme == "https":
        return 443
    return 80


def _gateway_health_candidates(gateway_url: str) -> Sequence[str]:
    normalized = gateway_url.rstrip("/")
    if not normalized:
        return ()
    urls: list[str] = []
    urls.append(f"{normalized}/health")
    if not normalized.endswith("/v1"):
        urls.append(f"{normalized}/v1/health")
        urls.append(f"{normalized}/portkey-ai/gateway/health")
    else:
        root = normalized[: -len("/v1")]
        if root:
            urls.append(f"{root}/health")
            urls.append(f"{root}/portkey-ai/gateway/health")
    deduped: list[str] = []
    seen: set[str] = set()
    for url in urls:
        if not url or url in seen:
            continue
        seen.add(url)
        deduped.append(url)
    return tuple(deduped)


def _wait_for_gateway_health(
    *,
    health_urls: Sequence[str],
    timeout: float,
    process: subprocess.Popen[str],
) -> None:
    if not health_urls:
        raise RuntimeError("Unable to compute the Portkey gateway health endpoints.")
    deadline = time.monotonic() + timeout
    last_error = ""
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Bundled Portkey gateway exited during startup.")
        for url in health_urls:
            try:
                response = requests.get(url, timeout=3)
            except RequestException as exc:
                last_error = f"{url}: {exc}"
                continue
            if 200 <= response.status_code < 300:
                LOGGER.info("Bundled Portkey gateway healthy at %s", url)
                return
            body = response.text.strip() or response.reason or ""
            last_error = f"{url}: status {response.status_code} {body}"
        time.sleep(HEALTH_POLL_INTERVAL_SECONDS)
    raise RuntimeError(
        "Timed out waiting for the bundled Portkey gateway to become healthy. "
        f"Last error: {last_error}"
    )


def _resolve_gateway_command(bundle_root: Path) -> list[str]:
    override = os.environ.get(ENV_OVERRIDE_COMMAND)
    if override:
        return shlex.split(override)

    entrypoint = _locate_entrypoint(bundle_root)
    suffix = entrypoint.suffix.lower()
    if suffix in {".js", ".cjs", ".mjs"}:
        node_executable = os.environ.get(ENV_NODE_EXECUTABLE, "node")
        return [node_executable, str(entrypoint)]
    if suffix in {".sh"}:
        return ["bash", str(entrypoint)]
    return [str(entrypoint)]


def _locate_entrypoint(bundle_root: Path) -> Path:
    package_json = bundle_root / "package.json"
    if not package_json.exists():
        raise RuntimeError(
            f"Portkey gateway bundle missing package.json at {package_json}"
        )
    manifest = json.loads(package_json.read_text(encoding="utf-8"))
    bin_entry = manifest.get("bin")
    script: str | None = None
    if isinstance(bin_entry, str):
        script = bin_entry
    elif isinstance(bin_entry, dict):
        for key in (
            "gateway",
            "portkey-ai-gateway",
            "@portkey-ai/gateway",
        ):
            if key in bin_entry:
                script = bin_entry[key]
                break
        if script is None and bin_entry:
            script = next(iter(bin_entry.values()))
    if not script:
        raise RuntimeError("Portkey gateway package.json missing a 'bin' entry.")
    entrypoint = (bundle_root / script).resolve()
    if not entrypoint.exists():
        raise RuntimeError(
            f"Portkey gateway entrypoint {entrypoint} is missing. "
            "Recreate the bundle from @portkey-ai/gateway."
        )
    return entrypoint


__all__ = [
    "BundledGatewayLifecycle",
    "DEFAULT_LOCAL_GATEWAY_PORT",
    "should_start_local_gateway",
]
