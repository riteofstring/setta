from __future__ import annotations

import ast
import json
import subprocess
import sys
from pathlib import Path

from setta.plugin_runtime import (
    APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION,
    listener_endpoint_names,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
PLUGIN_BACKEND_ROOTS = (
    REPO_ROOT / "plugins",
    REPO_ROOT / "tests" / "fixtures" / "plugins",
)
APP_SUBSYSTEM_BACKEND_ENTRYPOINTS = (
    REPO_ROOT / "plugins" / "setta-json-render-app-gen" / "runtime_backend" / "main.py",
    REPO_ROOT
    / "tests"
    / "fixtures"
    / "plugins"
    / "app-subsystem-unknown-id"
    / "runtime_backend"
    / "main.py",
)
ALLOWED_SETTA_IMPORT_PREFIXES = ("setta.plugin_runtime", "setta.types")


def _plugin_backend_python_files() -> list[Path]:
    files: list[Path] = []
    for root in PLUGIN_BACKEND_ROOTS:
        if not root.exists():
            continue
        for path in root.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            files.append(path)
    return sorted(files)


def _imported_modules(path: Path) -> set[str]:
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    modules: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            modules.update(alias.name for alias in node.names)
            continue
        if not isinstance(node, ast.ImportFrom):
            continue
        if node.level != 0 or node.module is None:
            continue
        modules.add(node.module)
    return modules


def _is_private_host_import(module_name: str) -> bool:
    if module_name == "setta":
        return True
    if module_name.startswith(("backend", "internal")):
        return True
    if not module_name.startswith("setta."):
        return False
    return not any(
        module_name == allowed or module_name.startswith(f"{allowed}.")
        for allowed in ALLOWED_SETTA_IMPORT_PREFIXES
    )


def test_plugin_owned_python_imports_stay_on_plugin_facing_sdk_surfaces() -> None:
    offenders: list[str] = []

    for path in _plugin_backend_python_files():
        for module_name in sorted(_imported_modules(path)):
            if not _is_private_host_import(module_name):
                continue
            offenders.append(f"{path.relative_to(REPO_ROOT)} imports {module_name}")

    assert not offenders, (
        "plugin-owned Python code must import only plugin-owned modules plus "
        "published Setta SDK surfaces:\n" + "\n".join(offenders)
    )


def test_app_subsystem_backend_entrypoints_advertise_real_probe_contract() -> None:
    expected_listener_endpoints = set(listener_endpoint_names())

    for entrypoint in APP_SUBSYSTEM_BACKEND_ENTRYPOINTS:
        result = subprocess.run(
            [sys.executable, str(entrypoint), "--setta-plugin-backend-probe"],
            check=True,
            capture_output=True,
            text=True,
            cwd=entrypoint.parent.parent,
        )
        payload = json.loads(result.stdout)

        assert {
            item["name"] for item in payload["appSubsystemBackend"]["listenerEndpoints"]
        } == expected_listener_endpoints
        assert payload["appSubsystemBackend"]["contractVersion"] == (
            APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION
        )
        assert payload["listenerEndpoints"] == []


def test_app_subsystem_backend_entrypoints_delegate_to_packaged_runtime_dispatcher() -> (
    None
):
    forbidden_snippets = (
        "run_local_core_command",
        "local_core_command_for_listener_endpoint",
        "listener_endpoint_names",
        "APP_SUBSYSTEM_BACKEND_CONTRACT_VERSION",
    )

    for entrypoint in APP_SUBSYSTEM_BACKEND_ENTRYPOINTS:
        source = entrypoint.read_text(encoding="utf-8")

        assert "run_app_subsystem_backend" in source
        for snippet in forbidden_snippets:
            assert snippet not in source, (
                f"{entrypoint.relative_to(REPO_ROOT)} must delegate app-subsystem "
                f"backend dispatch instead of copying {snippet}"
            )
