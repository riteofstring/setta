#!/usr/bin/env python3

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

BACKEND_PROBE_ARG = "--setta-plugin-backend-probe"
BACKEND_RUNTIME_ARG = "--setta-plugin-backend-runtime"


def _plugin_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _plugin_id() -> str:
    manifest_path = _plugin_root() / "setta.plugin.json"
    with manifest_path.open("r", encoding="utf-8") as handle:
        manifest = json.load(handle)
    plugin_id = str(manifest.get("id", "")).strip()
    if not plugin_id:
        raise RuntimeError("setta-watch-code manifest id is required")
    return plugin_id


def _write_json(payload: dict[str, Any]) -> None:
    json.dump(payload, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")
    sys.stdout.flush()


def _route(plugin_id: str, suffix: str) -> str:
    return f"/plugins/{plugin_id}/watch-code/{suffix}"


def _ui_settings() -> list[dict[str, Any]]:
    return [
        {
            "id": "enabled",
            "title": "Watch Code Enabled",
            "description": "Enable or disable Watch Code for the project.",
            "synonyms": ["watch code", "watch mode", "watch toggle"],
            "paneId": "left",
            "revealKey": "watch-code-settings",
            "mutability": "writable",
            "valueSchema": {"type": "boolean"},
            "readHandlerId": "read_enabled",
            "writeHandlerId": "write_enabled",
        },
        {
            "id": "folders",
            "title": "Watch Code Folders",
            "description": "List of folders watched by Watch Code.",
            "synonyms": ["watch folders", "watch code folders"],
            "paneId": "left",
            "revealKey": "watch-code-settings",
            "mutability": "writable",
            "valueSchema": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "recursive": {"type": "boolean"},
                    },
                    "required": ["path"],
                    "additionalProperties": False,
                },
            },
            "readHandlerId": "read_folders",
            "writeHandlerId": "write_folders",
        },
        {
            "id": "files",
            "title": "Watch Code Files",
            "description": "List of explicit files watched by Watch Code.",
            "synonyms": ["watch files", "watch code files"],
            "paneId": "left",
            "revealKey": "watch-code-settings",
            "mutability": "writable",
            "valueSchema": {
                "type": "array",
                "items": {"type": "string"},
            },
            "readHandlerId": "read_files",
            "writeHandlerId": "write_files",
        },
    ]


def _probe() -> None:
    plugin_id = _plugin_id()
    _write_json(
        {
            "schemaVersion": 1,
            "watchCodeBackend": {
                "contractVersion": 1,
                "dataSchemaVersion": 1,
                "languages": ["python"],
                "requiresLanguageServer": True,
            },
            "routes": [
                {"path": _route(plugin_id, "enabled"), "methods": ["POST"]},
                {"path": _route(plugin_id, "inputs"), "methods": ["POST"]},
            ],
            "uiSettings": _ui_settings(),
        }
    )


def _runtime() -> None:
    _write_json(
        {
            "schemaVersion": 1,
            "error": {
                "code": "watch_code_backend_runtime_not_implemented",
                "message": "Watch Code backend runtime handlers are not implemented yet.",
            },
        }
    )
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 2:
        return
    command = sys.argv[1]
    if command == BACKEND_PROBE_ARG:
        _probe()
        return
    if command == BACKEND_RUNTIME_ARG:
        _runtime()


if __name__ == "__main__":
    main()
