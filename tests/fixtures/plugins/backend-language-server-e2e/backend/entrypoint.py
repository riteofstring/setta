import sys
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Body, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel


class EchoBodyPayload(BaseModel):
    value: str
    count: int


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
        token: str | None = None,
        body: dict[str, Any] | None = Body(default=None),
    ) -> dict[str, Any]:
        raw_value = body.get("value") if isinstance(body, dict) else None
        raw_count = body.get("count") if isinstance(body, dict) else None
        value = raw_value if isinstance(raw_value, str) else None
        count = raw_count if isinstance(raw_count, int) else None
        return {
            "value": value,
            "count": count,
            "token": token,
            "body": body,
        }

    @router.post("/echo-model-body")
    def echo_model_body(payload: EchoBodyPayload) -> dict[str, Any]:
        return {
            "value": payload.value,
            "count": payload.count,
        }

    @router.get("/echo-query-default")
    def echo_query_default(limit: int = Query(10, ge=1)) -> dict[str, int]:
        return {"limit": limit}

    @router.get("/echo-query-list-int")
    def echo_query_list_int(values: list[int]) -> dict[str, list[int]]:
        return {"values": values}

    @router.get("/echo-query-scalar-int")
    def echo_query_scalar_int(limit: int) -> dict[str, int]:
        return {"limit": limit}

    @router.post("/echo-created")
    def echo_created() -> JSONResponse:
        return JSONResponse(
            status_code=201,
            content={"ok": True},
            headers={"x-setta-fixture": "created"},
        )

    @router.get("/echo-header-only-content-type")
    def echo_header_only_content_type() -> Response:
        return Response(
            content="ok",
            headers={"content-type": "application/x-custom"},
        )

    @router.get("/echo-not-found")
    def echo_not_found() -> None:
        raise HTTPException(status_code=404, detail="fixture-not-found")

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
