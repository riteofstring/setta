import asyncio
import json
import logging
from collections.abc import AsyncIterator
from typing import Any, Literal

import litellm
from fastapi import Depends, status
from fastapi.responses import JSONResponse, StreamingResponse
from litellm.types.utils import ModelResponseStream
from pydantic import BaseModel, Field

from setta.app.spec_patch_stream import ALLOWED_PATCH_OPS, parse_patch_line_with_error
from setta.routers.dependencies import RuntimeContextFromRequest, require_ide_mode
from setta.routers.setta_api_router import SettaAPIRouter
from setta.types.llm_config import AllLLMConfigs
from setta.types.routes import Route

router = SettaAPIRouter(dependencies=[Depends(require_ide_mode)])
logger = logging.getLogger(__name__)
_MAX_STREAM_REMAINDER_CHARS = 256_000
_MAX_CONTEXT_SUMMARY_CHARS = 100_000


class StreamAppSpecRequest(BaseModel):
    prompt: str = Field(description="Natural language app request prompt.")
    mode: (
        Literal[
            "json_render",
            "json_render_with_image",
            "prompt_builder",
            "mcp_server",
        ]
        | None
    ) = Field(
        default=None,
        description="Optional app generation mode context from the UI.",
    )
    referenceImageUrl: str | None = Field(
        default=None,
        description="Optional image URL to use as visual style/layout guidance.",
    )
    referenceImageNotes: str | None = Field(
        default=None,
        description="Optional notes describing what to copy from the reference image.",
    )
    context: dict[str, Any] | None = Field(
        default=None,
        description="Optional context (catalog summary, section summary, etc).",
    )
    currentSpec: Any | None = Field(
        default=None,
        description="Current spec state supplied by the client (useUIStream contract).",
    )


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


def _supports_vision(
    *,
    model: str,
    custom_llm_provider: str | None,
) -> bool:
    try:
        return litellm.supports_vision(
            model=model,
            custom_llm_provider=custom_llm_provider,
        )
    except Exception:
        return False


def _build_system_prompt(
    *,
    catalog_summary: str,
    sections_summary: str,
    current_spec_json: str | None,
    mode: Literal[
        "json_render",
        "json_render_with_image",
        "prompt_builder",
        "mcp_server",
    ]
    | None,
    reference_image_url: str | None,
    reference_image_notes: str | None,
) -> str:
    current_spec_lines: list[str] = []
    if current_spec_json is not None:
        current_spec_lines = [
            "Current spec (authoritative):",
            "- The client supplied a currentSpec. Emit patches that transform the currentSpec into the desired spec.",
            "- Do not re-emit unchanged elements. Prefer minimal patches.",
            current_spec_json,
            "",
        ]
    mode_lines: list[str] = []
    if mode is not None:
        mode_lines = [
            "App generation mode context:",
            f"- mode: {mode}",
            "- Prioritize the requested mode behavior while still returning only JSONL patches.",
            "",
        ]
    image_guidance_lines: list[str] = []
    if reference_image_url:
        image_guidance_lines = [
            "Reference-image fidelity constraints:",
            "- A reference image is provided in the user message content.",
            "- Prioritize overall layout structure first (sections/grid/stack order).",
            "- Then align spacing rhythm, typography scale, and color intent.",
            "- If an exact visual match is impossible with the catalog, choose the closest available approximation and preserve hierarchy.",
            "- Keep components within the allowed catalog while maximizing visual parity.",
            "",
        ]
        if reference_image_notes:
            image_guidance_lines.extend(
                [
                    "Reference-image notes from user:",
                    reference_image_notes,
                    "",
                ]
            )
    return "\n".join(
        [
            "You generate a JSON Render UI spec via JSONL patch operations.",
            "",
            *mode_lines,
            "Output requirements (STRICT):",
            "- Output ONLY JSON Lines (one JSON object per line).",
            "- No prose, no markdown, no code fences.",
            "- Each line must be a JSON object with keys: op, path, and (unless op=remove) value.",
            f"- Allowed ops: {sorted(ALLOWED_PATCH_OPS)!r}. Prefer 'set'.",
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
            *image_guidance_lines,
            *current_spec_lines,
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
    if not hasattr(stream_result, "__aiter__"):
        raise TypeError("LLM streaming must return an async iterator")

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
    if len(catalog_summary) > _MAX_CONTEXT_SUMMARY_CHARS:
        return _json_error(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="catalogSummary is too large. Reduce it or omit it.",
        )
    if len(sections_summary) > _MAX_CONTEXT_SUMMARY_CHARS:
        return _json_error(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="sectionsSummary is too large. Reduce it or omit it.",
        )
    current_spec_json: str | None = None
    if x.currentSpec is not None:
        try:
            current_spec_json = json.dumps(
                x.currentSpec,
                separators=(",", ":"),
                ensure_ascii=False,
            )
        except TypeError as exc:
            return _json_error(
                status_code=status.HTTP_400_BAD_REQUEST,
                message=f"currentSpec must be JSON-serializable: {exc}",
            )
        if len(current_spec_json) > 50_000:
            return _json_error(
                status_code=status.HTTP_400_BAD_REQUEST,
                message="currentSpec is too large. Reduce it or omit it.",
            )
    reference_image_url = (
        x.referenceImageUrl.strip() if isinstance(x.referenceImageUrl, str) else ""
    )
    reference_image_notes = (
        x.referenceImageNotes.strip() if isinstance(x.referenceImageNotes, str) else ""
    )
    if len(reference_image_url) > 4096:
        return _json_error(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="referenceImageUrl is too large. Reduce it or omit it.",
        )
    if len(reference_image_notes) > _MAX_CONTEXT_SUMMARY_CHARS:
        return _json_error(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="referenceImageNotes is too large. Reduce it or omit it.",
        )
    image_mode_enabled = x.mode == "json_render_with_image"
    effective_reference_image_url = (
        reference_image_url if image_mode_enabled and reference_image_url else ""
    )
    effective_reference_image_notes = (
        reference_image_notes if image_mode_enabled and reference_image_notes else ""
    )
    if effective_reference_image_url:
        raw_model = request.get("model")
        model = raw_model if isinstance(raw_model, str) else ""
        raw_provider = request.get("custom_llm_provider")
        custom_llm_provider = (
            raw_provider if isinstance(raw_provider, str) else None
        )
        if not _supports_vision(
            model=model,
            custom_llm_provider=custom_llm_provider,
        ):
            return _json_error(
                status_code=status.HTTP_400_BAD_REQUEST,
                message=(
                    "The selected model does not support image inputs. "
                    "Use a vision-capable model or switch to JSON Render mode."
                ),
            )
    system_prompt = _build_system_prompt(
        catalog_summary=catalog_summary,
        sections_summary=sections_summary,
        current_spec_json=current_spec_json,
        mode=x.mode,
        reference_image_url=(
            effective_reference_image_url if effective_reference_image_url else None
        ),
        reference_image_notes=(
            effective_reference_image_notes if effective_reference_image_notes else None
        ),
    )

    user_prompt = x.prompt.strip()
    if not user_prompt:
        return _json_error(
            status_code=status.HTTP_400_BAD_REQUEST,
            message="Prompt must be non-empty.",
        )

    # Keep the payload intentionally simple (no tools) so the model produces raw patch lines.
    user_content: Any = user_prompt
    if effective_reference_image_url:
        user_content = [
            {"type": "text", "text": user_prompt},
            {
                "type": "image_url",
                "image_url": {"url": effective_reference_image_url, "detail": "high"},
            },
        ]
    request["messages"] = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    try:
        stream_result = await litellm.acompletion(**request, stream=True)
    except Exception as exc:
        message = str(exc) or exc.__class__.__name__
        return _json_error(
            status_code=status.HTTP_502_BAD_GATEWAY,
            message=f"LLM request failed: {message}",
        )
    if not hasattr(stream_result, "__aiter__"):
        return _json_error(
            status_code=status.HTTP_502_BAD_GATEWAY,
            message="LLM streaming must return an async iterator.",
        )

    async def _stream() -> AsyncIterator[bytes]:
        remainder = ""
        patch_count = 0
        invalid_line_count = 0
        async for chunk in _iterate_stream(stream_result):
            text = _extract_text_from_chunk(chunk)
            if not text:
                continue
            remainder += text
            if len(remainder) > _MAX_STREAM_REMAINDER_CHARS and "\n" not in remainder:
                logger.warning(
                    "streamAppSpec remainder exceeded %s chars without newline; aborting stream",
                    _MAX_STREAM_REMAINDER_CHARS,
                )
                break
            while True:
                newline_index = remainder.find("\n")
                if newline_index == -1:
                    break
                line = remainder[:newline_index]
                remainder = remainder[newline_index + 1 :]
                patch, error = parse_patch_line_with_error(line)
                if patch is None:
                    if error is not None:
                        invalid_line_count += 1
                        if invalid_line_count <= 5:
                            logger.warning(
                                "streamAppSpec ignored invalid patch line: %s", error
                            )
                    continue
                yield (json.dumps(patch, separators=(",", ":")) + "\n").encode("utf-8")
                patch_count += 1
                if patch_count % 100 == 0:
                    await asyncio.sleep(0)

        if remainder.strip():
            patch, error = parse_patch_line_with_error(remainder)
            if patch is not None:
                yield (json.dumps(patch, separators=(",", ":")) + "\n").encode("utf-8")
            elif error is not None:
                logger.warning("streamAppSpec ignored invalid patch line: %s", error)

    return StreamingResponse(_stream(), media_type="application/x-ndjson")
