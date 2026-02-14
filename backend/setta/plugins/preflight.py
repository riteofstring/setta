import argparse
import importlib.util
import inspect
import json
import sys
from pathlib import Path
from typing import Any, Literal


class _NoopBackendPluginContext:
    def __init__(self, plugin_id: str, plugin_root: Path) -> None:
        self.plugin_id = plugin_id
        self.plugin_root = plugin_root
        self.server_mode: Literal["ide", "share", "app"] = "ide"
        self.requested_capabilities: list[str] = []
        self.effective_capabilities: list[str] = []

    @property
    def deployment_mode(self) -> bool:
        return False

    def register_router(self, _router: Any, *, prefix: str | None = None) -> None:
        if prefix:
            return None
        return None

    def register_static_dir(self, _url_prefix: str, _path: str | Path) -> None:
        return None

    def register_mcp_tool(
        self,
        _func: Any,
        *,
        name: str | None = None,
        annotations: dict[str, Any] | None = None,
    ) -> None:
        if name:
            return None
        if annotations:
            return None
        return None

    def register_external_agent_adapter(self, _adapter: Any) -> None:
        return None

    def register_language_server(self, _provider: Any) -> None:
        return None

    def register_codegen_target(self, _target: Any) -> None:
        return None

    def register_startup_task(self, _coro_fn: Any) -> None:
        return None

    def register_shutdown_task(self, _coro_fn: Any) -> None:
        return None


def _emit_error(code: str, message: str) -> int:
    payload = {"code": code, "message": message}
    print(json.dumps(payload), file=sys.stderr)
    return 1


def _load_module(plugin_id: str, entrypoint_path: Path) -> Any:
    module_name = f"setta_plugin_preflight_{plugin_id.replace('-', '_')}"
    spec = importlib.util.spec_from_file_location(module_name, entrypoint_path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Failed to construct module import spec.")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> int:
    parser = argparse.ArgumentParser(description="Setta plugin backend preflight")
    parser.add_argument("--plugin-id", required=True)
    parser.add_argument("--plugin-root", required=True)
    parser.add_argument("--entrypoint", required=True)
    parser.add_argument("--stage", choices=("import", "register"), required=True)
    args = parser.parse_args()

    plugin_id = str(args.plugin_id).strip()
    plugin_root = Path(args.plugin_root).expanduser().resolve(strict=False)
    entrypoint_path = Path(args.entrypoint).expanduser().resolve(strict=False)
    stage = str(args.stage).strip()

    if not plugin_id:
        return _emit_error("PLUGIN_BACKEND_IMPORT_FAILED", "Missing plugin id.")
    if not entrypoint_path.exists() or not entrypoint_path.is_file():
        return _emit_error(
            "PLUGIN_BACKEND_IMPORT_FAILED",
            f"Backend entrypoint not found: {entrypoint_path}",
        )
    try:
        module = _load_module(plugin_id, entrypoint_path)
    except Exception as exc:
        return _emit_error(
            "PLUGIN_BACKEND_IMPORT_FAILED",
            f"Failed to import backend plugin {plugin_id}: {exc}",
        )
    if stage == "import":
        return 0

    register_fn = getattr(module, "register", None)
    if register_fn is None or not callable(register_fn):
        return _emit_error(
            "PLUGIN_BACKEND_IMPORT_FAILED",
            (
                f"Backend plugin {plugin_id} does not expose a callable "
                "register(plugin) entrypoint."
            ),
        )
    context = _NoopBackendPluginContext(plugin_id, plugin_root)
    try:
        result = register_fn(context)
    except Exception as exc:
        return _emit_error(
            "PLUGIN_BACKEND_REGISTER_FAILED",
            f"Backend plugin register failed for {plugin_id}: {exc}",
        )
    if inspect.isawaitable(result):
        return _emit_error(
            "PLUGIN_BACKEND_REGISTER_FAILED",
            (
                f"Backend plugin {plugin_id} returned an awaitable from "
                "register(plugin); async register is not supported in MVP."
            ),
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
