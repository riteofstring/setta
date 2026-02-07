import asyncio
import json
from collections.abc import AsyncIterator
from typing import Any

import litellm
from fastapi import Depends, status
from fastapi.responses import JSONResponse, StreamingResponse
from litellm.litellm_core_utils.streaming_handler import CustomStreamWrapper
from litellm.types.utils import ModelResponseStream
from pydantic import BaseModel, Field

from setta.routers.dependencies import RuntimeContextFromRequest, require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.llm_config import AllLLMConfigs
from setta.types.routes import Route

router = SettaAPIRouter(dependencies=[Depends(require_ide_mode)])


class StreamAppSpecRequest(BaseModel):
    prompt: str = Field(description="Natural language app request prompt.")
    context: dict[str, Any] | None = Field(
        default=None,
        description="Optional context (catalog summary, section summary, etc).",
    )
    currentSpec: Any | None = Field(
        default=None,
        description="Current spec state supplied by the client (useUIStream contract).",
    )


_ALLOWED_OPS = {"set", "add", "replace", "remove"}


def _parse_patch_line(line: str) -> dict[str, Any] | None:
    trimmed = line.strip()
    if not trimmed or trimmed.startswith("//"):
        return None
    try:
        payload = json.loads(trimmed)
    except json.JSONDecodeError:
        return None
    if not isinstance(payload, dict):
        return None
    op = payload.get("op")
    path = payload.get("path")
    if not isinstance(op, str) or op not in _ALLOWED_OPS:
        return None
    if not isinstance(path, str):
        return None
    if path != "/root" and not path.startswith("/elements/"):
        return None
    if op != "remove" and "value" not in payload:
        return None
    return payload


def _pick_llm_config_id(config: AllLLMConfigs, context: dict[str, Any] | None) -> str:
    raw = None if not context else context.get("llmConfigId")
    if isinstance(raw, str) and raw.strip():
        return raw.strip()
    if config.default_config_id:
        return config.default_config_id
    if config.configs:
        return next(iter(config.configs.keys()))
    raise ValueError("No LLM config available. Add one under Project AI settings.")


def _json_error(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"message": message})


def _build_system_prompt(*, catalog_summary: str, sections_summary: str) -> str:
    return "\n".join(
        [
            "You generate a JSON Render UI spec via JSONL patch operations.",
            "",
            "Output requirements (STRICT):",
            "- Output ONLY JSON Lines (one JSON object per line).",
            "- No prose, no markdown, no code fences.",
            "- Each line must be a JSON object with keys: op, path, and (unless op=remove) value.",
            f"- Allowed ops: {sorted(_ALLOWED_OPS)!r}. Prefer 'set'.",
            "- Allowed paths:",
            '  - "/root" (value must be the root element key string)',
            '  - "/elements/<key>" (value must be a full UIElement object)',
            '  - "/elements/<key>/props/..." (only after /elements/<key> exists)',
            "",
            "UIElement rules:",
            "- Every element value must include string fields: key, type.",
            "- props must be an object (or omitted).",
            "- children must be a list of element keys (strings) (or omitted).",
            "- Ensure /root references an element present in /elements.",
            "",
            "Setta rules:",
            "- Use only catalog components.",
            "- Bind ParamInput with sectionId + paramId (or dataPath -> dataBindings).",
            "- Do not bind ParamInput to CodeParam params; CodeParam edits are blocked in app deployments.",
            "- dataPath values must be JSON Pointer strings (example: /params/name).",
            '- Include one ActionButton with action "run" and set its sectionId.',
            "",
            catalog_summary.strip()
            if catalog_summary.strip()
            else "Catalog unavailable.",
            "",
            "Available sections (use ids as sectionId; param ids are paramId):",
            sections_summary.strip() if sections_summary.strip() else "- (none)",
            "",
            "Begin streaming patches now.",
        ]
    )


async def _iterate_stream(stream_result: Any) -> AsyncIterator[ModelResponseStream]:
    if not isinstance(stream_result, CustomStreamWrapper):
        raise TypeError("LLM streaming must return a CustomStreamWrapper")

    async for chunk in stream_result:
        if isinstance(chunk, ModelResponseStream):
            yield chunk


def _extract_text_from_chunk(chunk: ModelResponseStream) -> str:
    if not chunk.choices:
        return ""
    delta = chunk.choices[0].delta
    content = getattr(delta, "content", None)
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        texts: list[str] = []
        for entry in content:
            if isinstance(entry, str):
                texts.append(entry)
                continue
            if isinstance(entry, dict):
                text = entry.get("text")
                if isinstance(text, str):
                    texts.append(text)
        return "".join(texts)
    return ""


@router.post(Route.STREAM_APP_SPEC)
async def route_stream_app_spec(
    x: StreamAppSpecRequest,
    ctx: RuntimeContextFromRequest,
):
    await ctx.enforce_llm_allowed()

    if ctx.state.agent_runner.disabled:
        return _json_error(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            message="Agent runner is not available.",
        )

    context = x.context or {}
    try:
        llm_config_id = _pick_llm_config_id(ctx.state.agent_runner.config, context)
    except ValueError as exc:
        return _json_error(
            status_code=status.HTTP_400_BAD_REQUEST,
            message=str(exc),
        )
    try:
        llm_config = ctx.state.agent_runner.config.resolve_config(llm_config_id)
    except Exception:
        return _json_error(
            status_code=status.HTTP_400_BAD_REQUEST,
            message=f"Unknown LLM config id: {llm_config_id}",
        )

    request, api_key_env = ctx.state.agent_runner.config.build_llm_params(llm_config)
    if api_key_env:
        api_key = ctx.state.agent_runner.api_keys.get(api_key_env)
        if not api_key:
            return _json_error(
                status_code=status.HTTP_400_BAD_REQUEST,
                message=f"Missing API key for env var {api_key_env}.",
            )
        request["api_key"] = api_key

    catalog_summary = (
        context.get("catalogSummary")
        if isinstance(context.get("catalogSummary"), str)
        else ""
    )
    sections_summary = (
        context.get("sectionsSummary")
        if isinstance(context.get("sectionsSummary"), str)
        else ""
    )
    system_prompt = _build_system_prompt(
        catalog_summary=catalog_summary,
        sections_summary=sections_summary,
    )

    user_prompt = x.prompt.strip()
    if not user_prompt:
        return _json_error(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="Prompt must be non-empty.",
        )

    # Keep the payload intentionally simple (no tools) so the model produces raw patch lines.
    request["messages"] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    try:
        stream_result = await litellm.acompletion(**request, stream=True)
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        return _json_error(
            status_code=status.HTTP_502_BAD_GATEWAY,
            message=f"LLM request failed: {message}",
        )
    if not isinstance(stream_result, CustomStreamWrapper):
        return _json_error(
            status_code=status.HTTP_502_BAD_GATEWAY,
            message="LLM streaming must return a CustomStreamWrapper.",
        )

    async def _stream() -> AsyncIterator[bytes]:
        buffer = ""
        async for chunk in _iterate_stream(stream_result):
            text = _extract_text_from_chunk(chunk)
            if not text:
                continue
            buffer += text
            if "\n" not in buffer:
                continue
            lines = buffer.split("\n")
            buffer = lines.pop() or ""
            for line in lines:
                patch = _parse_patch_line(line)
                if patch is None:
                    continue
                encoded = (json.dumps(patch, separators=(",", ":")) + "\n").encode(
                    "utf-8"
                )
                yield encoded
                await asyncio.sleep(0)

        if buffer.strip():
            patch = _parse_patch_line(buffer)
            if patch is not None:
                yield (json.dumps(patch, separators=(",", ":")) + "\n").encode("utf-8")

    return StreamingResponse(_stream(), media_type="text/plain")
