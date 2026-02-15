import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter


def register(plugin):
    router = APIRouter()

    @router.get("/echo-query")
    def echo_query(alpha: str | None = None, repeated: Any = None) -> dict[str, Any]:
        return {
            "alpha": alpha,
            "repeated": repeated,
            "repeatedIsList": isinstance(repeated, list),
        }

    @router.post("/echo-body")
    def echo_body(
        value: str | None = None,
        count: int | None = None,
        token: str | None = None,
        body: Any = None,
    ) -> dict[str, Any]:
        return {
            "value": value,
            "count": count,
            "token": token,
            "body": body,
        }

    plugin.register_router(router, prefix="/payload")

    server_path = Path(__file__).resolve().parent / "mini_language_server.py"
    plugin.register_language_server(
        {
            "language": "fixturedsl",
            "command": sys.executable,
            "args": [str(server_path)],
            "settingsKey": "fixtureDslLanguageServer",
        }
    )
