import argparse
from importlib import util
import sys
from pathlib import Path
from typing import Callable


_IMPORT_ROOT = Path(__file__).resolve(strict=False).parents[2]
if str(_IMPORT_ROOT) not in sys.path:
    sys.path.insert(0, str(_IMPORT_ROOT))

from setta.api import SettaListener
from setta.utils.env_vars import RUNTIME_ROOT_ENV

_BUILDER_NAMES = ("build_listener", "build_callbacks")
_READY_SENTINEL = "SETTA_DEPLOYMENT_LISTENER_READY"

_ListenerBuilder = Callable[[SettaListener], None]


def _sanitize_module_suffix(value: str) -> str:
    sanitized: list[str] = []
    for char in value:
        if char.isalnum() or char == "_":
            sanitized.append(char)
        else:
            sanitized.append("_")
    return "".join(sanitized)


def _load_builder(
    *,
    deployment_root: Path,
    entrypoint_path: Path,
    session_id: str,
    project_config_id: str,
) -> _ListenerBuilder:
    safe_suffix = _sanitize_module_suffix(f"{session_id}_{project_config_id}")
    base = _sanitize_module_suffix(deployment_root.name)
    module_name = f"setta_share_listener_{base}_{safe_suffix}"
    spec = util.spec_from_file_location(module_name, entrypoint_path)
    if spec is None or spec.loader is None:
        raise KeyError(
            f"Failed to load share listener entrypoint: {entrypoint_path}"
        )
    module = util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    for name in _BUILDER_NAMES:
        candidate = getattr(module, name, None)
        if candidate is None:
            continue
        if not callable(candidate):
            raise TypeError(f"Share listener {name} must be callable")
        return candidate
    raise KeyError(
        "Share listener entrypoint must define build_listener or build_callbacks"
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Start a retained deployment listener process."
    )
    parser.add_argument("--deployment-root", required=True)
    parser.add_argument("--entrypoint", required=True)
    parser.add_argument("--session-id", required=True)
    parser.add_argument("--project-config-id", required=True)
    parser.add_argument("--host", required=True)
    parser.add_argument("--port", required=True, type=int)
    parser.add_argument("--runtime-root", default="")
    args = parser.parse_args()

    deployment_root = Path(args.deployment_root).resolve(strict=False)
    entrypoint_path = Path(args.entrypoint).resolve(strict=False)
    runtime_root = args.runtime_root.strip()
    if runtime_root:
        import os

        os.environ.setdefault(RUNTIME_ROOT_ENV, runtime_root)

    builder = _load_builder(
        deployment_root=deployment_root,
        entrypoint_path=entrypoint_path,
        session_id=args.session_id,
        project_config_id=args.project_config_id,
    )

    listener = SettaListener(
        project_config_id=args.project_config_id,
        share_session_id=args.session_id,
        host=args.host,
        port=args.port,
    )
    builder(listener)
    print(_READY_SENTINEL, flush=True)
    listener.start()


if __name__ == "__main__":
    main()
