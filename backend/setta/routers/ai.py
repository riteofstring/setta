import base64
import binascii
from enum import Enum
from typing import Literal

from fastapi import HTTPException, status
from pydantic import BaseModel, Field

from setta.agentic.chat_view import (
    EXTERNAL_AGENT_RUN_TYPE,
    LLM_CHAT_RUN_TYPE,
    build_chat_state_from_run,
    get_run_engine_config_id,
    get_run_sort_key,
)
from setta.agentic.context_usage import (
    ResolvedChatContextUsage,
    resolve_external_run_context_usage,
    resolve_internal_run_context_usage,
)
from setta.agentic.managed_chat_dispatch import (
    ManagedChatDispatcher,
    ManagedChatDispatchRequestBase,
    ManagedChatDispatchResponse,
)
from setta.agentic.store import (
    list_agent_runs_by_metadata,
    require_engine_config,
)
from setta.agentic.transcription_profile_resolver import (
    TranscriptionProfileNotFoundError,
    resolve_transcription_profile,
)
from setta.llm.transcription_sessions import (
    TranscriptionAudioLimitExceededError,
    TranscriptionSessionError,
    TranscriptionSessionNotFoundError,
)
from setta.llm.user_facing_errors import get_user_facing_llm_error_message
from setta.logging.project_id_route import require_project_context
from setta.routers.dependencies import RuntimeContextFromRequest
from setta.routers.setta_api_router import SettaProjectContextFullRuntimeAPIRouter
from setta.types.agentic import AgentRun, AgentRunStatus, EngineType
from setta.types.generated.chat_messages import (
    BaseChatMessageTypeAdapter,
    BaseChatMessageUnion,
    BaseChatMessageUnionWithDiscriminator,
)
from setta.types.id import ID
from setta.types.llm_config import LLMConfig
from setta.types.routes import Route
from setta.types.websocket import AIFollowToolArgumentsUpdateContent
from setta.utils.constants import C

router = SettaProjectContextFullRuntimeAPIRouter()
ChatAppGenerationMessageMode = Literal[
    "plain_chat",
    "json_render",
    "json_render_with_image",
    "prompt_builder",
    "mcp_server",
]
_CHAT_APP_GENERATION_MESSAGE_MODES = frozenset(
    {
        "plain_chat",
        "json_render",
        "json_render_with_image",
        "prompt_builder",
        "mcp_server",
    }
)

_REQUIRED_ERROR_CHECK_PROMPT = (
    "## Required completion gate for create/scaffold work\n"
    "- For project creation, section creation, or scaffolding tasks: do not claim completion until you run error checks.\n"
    "- Report check outcomes explicitly as pass/fail before any completion claim.\n"
    "- If checks were not run or checks failed, state that explicitly instead of saying the work is done.\n"
)
_TRANSCRIPTION_PCM_MAX_BYTES = (
    C.REALTIME_BINARY_MAX_BYTES if C.REALTIME_BINARY_MAX_BYTES > 0 else 10 * 1024 * 1024
)


def _format_payload_size_label(max_bytes: int) -> str:
    if max_bytes >= 1024 * 1024:
        return f"{max_bytes // (1024 * 1024)} MB"
    return f"{max_bytes} bytes"


def _build_audio_payload_too_large_detail(max_bytes: int) -> str:
    return f"Audio payload is too large. Maximum size is {_format_payload_size_label(max_bytes)}."


def _get_llm_chat_runs(
    *,
    dbe,
    chat_id: ID | None = None,
    project_config_id: ID | None = None,
) -> list[AgentRun]:
    return list_agent_runs_by_metadata(
        dbe,
        run_type=LLM_CHAT_RUN_TYPE,
        chat_id=chat_id,
        project_config_id=project_config_id,
    )


def _get_external_agent_chat_runs(
    *,
    dbe,
    chat_id: ID | None = None,
    project_config_id: ID | None = None,
) -> list[AgentRun]:
    return list_agent_runs_by_metadata(
        dbe,
        run_type=EXTERNAL_AGENT_RUN_TYPE,
        chat_id=chat_id,
        project_config_id=project_config_id,
    )


def _select_latest_run(runs: list[AgentRun]) -> AgentRun | None:
    if not runs:
        return None
    return max(runs, key=get_run_sort_key)


def _to_chat_context_usage(
    usage: ResolvedChatContextUsage | None,
) -> "ChatContextUsage | None":
    if usage is None:
        return None
    return ChatContextUsage(
        contextWindowTokens=usage.context_window_tokens,
        contextUsedTokens=usage.context_used_tokens,
        estimated=usage.estimated,
    )


def _get_run_input_messages(run: AgentRun | None) -> list[BaseChatMessageUnion]:
    if run is None:
        return []
    inputs = run.inputs
    if not inputs:
        return []
    raw_messages = inputs.get("messages")
    if not isinstance(raw_messages, list):
        return []
    return [BaseChatMessageTypeAdapter.validate_python(raw) for raw in raw_messages]


def _get_run_output_messages(run: AgentRun | None) -> list[BaseChatMessageUnion]:
    if run is None:
        return []
    outputs = run.outputs
    if not outputs:
        return []
    raw_messages = outputs.get("messages")
    if not isinstance(raw_messages, list):
        return []
    return [BaseChatMessageTypeAdapter.validate_python(raw) for raw in raw_messages]


class GetLLMResponseRequest(ManagedChatDispatchRequestBase):
    pass


class GetLLMResponseResponse(ManagedChatDispatchResponse):
    pass


class GetLLMChatRequest(BaseModel):
    chatId: ID
    projectConfigId: ID | None


class StartTranscriptionSessionRequest(BaseModel):
    transcriptionProfileId: ID
    language: str | None = None


class StartTranscriptionSessionResponse(BaseModel):
    sessionId: ID
    resolvedTransportMode: Literal["file", "realtime"]
    chunkMs: int


class AppendTranscriptionAudioRequest(BaseModel):
    sessionId: ID
    audioPcm16Base64: str
    sampleRateHz: int
    channels: int = 1


class StopTranscriptionSessionRequest(BaseModel):
    sessionId: ID


class CancelTranscriptionSessionRequest(BaseModel):
    sessionId: ID


class CancelTranscriptionSessionResponse(BaseModel):
    ok: bool = True


class TranscriptionSessionDeltaResponse(BaseModel):
    appendText: str
    fullText: str
    isFinal: bool


class TranscriptionErrorCode(str, Enum):
    unsupported_model = "unsupported_model"
    missing_api_key = "missing_api_key"
    profile_not_found = "profile_not_found"
    session_not_found = "session_not_found"
    invalid_request = "invalid_request"
    audio_payload_too_large = "audio_payload_too_large"
    provider_failure = "provider_failure"


class TranscriptionErrorDetail(BaseModel):
    message: str
    errorCode: TranscriptionErrorCode


class ChatHydrationErrorCode(str, Enum):
    chat_not_found = "chat_not_found"


class ChatHydrationErrorDetail(BaseModel):
    message: str
    errorCode: ChatHydrationErrorCode


class ContinueFromChatErrorCode(str, Enum):
    source_chat_not_found = "source_chat_not_found"


class ContinueFromChatErrorDetail(BaseModel):
    message: str
    errorCode: ContinueFromChatErrorCode


class ChatContextUsage(BaseModel):
    contextWindowTokens: int | None = None
    contextUsedTokens: int | None = None
    estimated: bool = False


class GetLLMChatRequestResponse(BaseModel):
    messages: list[BaseChatMessageUnionWithDiscriminator]
    waitingForResponse: bool
    llmConfig: LLMConfig | None
    contextUsage: ChatContextUsage | None = None
    appGenerationByMessageId: dict[str, ChatAppGenerationMessageMode] = Field(
        default_factory=dict
    )


class GetExternalAgentChatRequest(BaseModel):
    chatId: ID
    projectConfigId: ID | None


class GetExternalAgentChatResponse(BaseModel):
    messages: list[BaseChatMessageUnionWithDiscriminator]
    waitingForResponse: bool
    toolCallArguments: dict[str, str] = Field(default_factory=dict)
    contextUsage: ChatContextUsage | None = None
    appGenerationByMessageId: dict[str, ChatAppGenerationMessageMode] = Field(
        default_factory=dict
    )


class StopLLMChatRequest(BaseModel):
    chatId: ID


class StopLLMChatResponse(BaseModel):
    alreadyStopped: bool
    stoppedRunId: ID | None = None
    stoppedMessageId: ID | None = None


class GetAIFollowSnapshotRequest(BaseModel):
    projectConfigId: ID


def _get_run_app_generation_by_message_id(
    run: AgentRun,
) -> dict[str, ChatAppGenerationMessageMode]:
    inputs = run.inputs
    if not inputs:
        return {}
    raw_mapping = inputs.get("appGenerationByMessageId")
    if isinstance(raw_mapping, dict):
        normalized: dict[str, ChatAppGenerationMessageMode] = {}
        for message_id, raw_mode in raw_mapping.items():
            if not isinstance(message_id, str) or not message_id:
                continue
            if raw_mode not in _CHAT_APP_GENERATION_MESSAGE_MODES:
                continue
            normalized[message_id] = raw_mode
        if normalized:
            return normalized
    return {}


def _resolve_latest_assistant_message_id_from_run(run: AgentRun) -> ID | None:
    input_ids = {message.id for message in _get_run_input_messages(run)}
    for message in reversed(_get_run_output_messages(run)):
        if message.role != "assistant":
            continue
        if message.id in input_ids:
            continue
        raw_message_id = getattr(message, "id", None)
        if isinstance(raw_message_id, str) and raw_message_id:
            return ID(raw_message_id)
    return None


def _normalize_transcription_language(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    return stripped


def _raise_transcription_http_error(
    *,
    status_code: int,
    message: str,
    error_code: TranscriptionErrorCode,
) -> None:
    raise HTTPException(
        status_code=status_code,
        detail=TranscriptionErrorDetail(
            message=message,
            errorCode=error_code,
        ).model_dump(mode="json"),
    )


def _raise_chat_hydration_http_error(
    *,
    status_code: int = 409,
    message: str,
    error_code: ChatHydrationErrorCode,
) -> None:
    raise HTTPException(
        status_code=status_code,
        detail=ChatHydrationErrorDetail(
            message=message,
            errorCode=error_code,
        ).model_dump(mode="json"),
    )


def _raise_continue_from_chat_http_error(
    *,
    status_code: int = 404,
    message: str,
    error_code: ContinueFromChatErrorCode,
) -> None:
    raise HTTPException(
        status_code=status_code,
        detail=ContinueFromChatErrorDetail(
            message=message,
            errorCode=error_code,
        ).model_dump(mode="json"),
    )


def _decode_pcm16_payload(audio_pcm16_base64: str) -> bytes:
    stripped_payload = audio_pcm16_base64.strip()
    if not stripped_payload:
        _raise_transcription_http_error(
            status_code=400,
            message="Audio payload is empty.",
            error_code=TranscriptionErrorCode.invalid_request,
        )
    estimated_decoded_bytes = (len(stripped_payload) * 3) // 4
    if stripped_payload.endswith("=="):
        estimated_decoded_bytes -= 2
    elif stripped_payload.endswith("="):
        estimated_decoded_bytes -= 1
    if estimated_decoded_bytes > _TRANSCRIPTION_PCM_MAX_BYTES:
        _raise_transcription_http_error(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            message=_build_audio_payload_too_large_detail(_TRANSCRIPTION_PCM_MAX_BYTES),
            error_code=TranscriptionErrorCode.audio_payload_too_large,
        )
    try:
        decoded = base64.b64decode(stripped_payload, validate=True)
    except binascii.Error:
        _raise_transcription_http_error(
            status_code=400,
            message="Audio payload is not valid base64.",
            error_code=TranscriptionErrorCode.invalid_request,
        )
    if not decoded:
        _raise_transcription_http_error(
            status_code=400,
            message="Audio payload is empty.",
            error_code=TranscriptionErrorCode.invalid_request,
        )
    if len(decoded) > _TRANSCRIPTION_PCM_MAX_BYTES:
        _raise_transcription_http_error(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            message=_build_audio_payload_too_large_detail(_TRANSCRIPTION_PCM_MAX_BYTES),
            error_code=TranscriptionErrorCode.audio_payload_too_large,
        )
    if len(decoded) % 2 != 0:
        _raise_transcription_http_error(
            status_code=400,
            message="Audio payload must be PCM16 with an even byte length.",
            error_code=TranscriptionErrorCode.invalid_request,
        )
    return decoded


def _resolve_transcription_session_error_code(
    exc: TranscriptionSessionError,
) -> TranscriptionErrorCode:
    if exc.error_code == "unsupported_model":
        return TranscriptionErrorCode.unsupported_model
    return TranscriptionErrorCode.invalid_request


@router.post(Route.GET_LLM_RESPONSE)
@require_project_context()
async def route_get_llm_response(
    x: GetLLMResponseRequest,
    ctx: RuntimeContextFromRequest,
) -> GetLLMResponseResponse:
    await ctx.enforce_llm_allowed()
    response = ManagedChatDispatcher(
        dbe=ctx.state.dbe,
        agent_runner=ctx.state.agent_runner,
        external_agent_runner=ctx.state.external_agent_runner,
    ).dispatch(x)
    return GetLLMResponseResponse.model_validate(response.model_dump(mode="json"))


def _to_transcription_delta_response(
    *,
    append_text: str,
    full_text: str,
    is_final: bool,
) -> TranscriptionSessionDeltaResponse:
    return TranscriptionSessionDeltaResponse(
        appendText=append_text,
        fullText=full_text,
        isFinal=is_final,
    )


@router.post(Route.START_TRANSCRIPTION_SESSION)
async def route_start_transcription_session(
    x: StartTranscriptionSessionRequest,
    ctx: RuntimeContextFromRequest,
) -> StartTranscriptionSessionResponse:
    await ctx.enforce_llm_allowed()
    if ctx.state.agent_runner.disabled:
        raise HTTPException(status_code=503, detail="Agent runner is not available")
    try:
        resolved = resolve_transcription_profile(
            ctx.state.dbe,
            ctx.state.agent_runner.config,
            x.transcriptionProfileId,
        )
    except TranscriptionProfileNotFoundError as exc:
        detail = (
            exc.args[0]
            if exc.args and isinstance(exc.args[0], str)
            else "Transcription profile not found."
        )
        _raise_transcription_http_error(
            status_code=404,
            message=detail,
            error_code=TranscriptionErrorCode.profile_not_found,
        )
    try:
        (
            session_id,
            resolved_transport_mode,
            chunk_ms,
        ) = await ctx.state.transcription_session_manager.start_session(
            scope_id=ctx.session_id,
            resolved_profile=resolved,
            config=ctx.state.agent_runner.config,
            api_keys=ctx.state.agent_runner.api_keys,
            language_override=_normalize_transcription_language(x.language),
        )
    except KeyError as exc:
        detail = (
            exc.args[0]
            if exc.args and isinstance(exc.args[0], str)
            else "Missing API key for transcription."
        )
        _raise_transcription_http_error(
            status_code=400,
            message=detail,
            error_code=TranscriptionErrorCode.missing_api_key,
        )
    except TranscriptionSessionError as exc:
        _raise_transcription_http_error(
            status_code=400,
            message=str(exc),
            error_code=_resolve_transcription_session_error_code(exc),
        )
    except ValueError as exc:
        detail = str(exc)
        _raise_transcription_http_error(
            status_code=400,
            message=detail,
            error_code=TranscriptionErrorCode.invalid_request,
        )
    except Exception as exc:
        detail = (
            get_user_facing_llm_error_message(exc) or "Provider transcription failed."
        )
        _raise_transcription_http_error(
            status_code=502,
            message=detail,
            error_code=TranscriptionErrorCode.provider_failure,
        )
    resolved_mode_literal: Literal["file", "realtime"] = (
        "realtime" if resolved_transport_mode == "realtime" else "file"
    )
    return StartTranscriptionSessionResponse(
        sessionId=session_id,
        resolvedTransportMode=resolved_mode_literal,
        chunkMs=chunk_ms,
    )


@router.post(Route.APPEND_TRANSCRIPTION_AUDIO)
async def route_append_transcription_audio(
    x: AppendTranscriptionAudioRequest,
    ctx: RuntimeContextFromRequest,
) -> TranscriptionSessionDeltaResponse:
    await ctx.enforce_llm_allowed()
    if x.sampleRateHz <= 0:
        raise HTTPException(
            status_code=400, detail="sampleRateHz must be greater than 0."
        )
    if x.channels <= 0:
        raise HTTPException(status_code=400, detail="channels must be greater than 0.")
    audio_pcm16 = _decode_pcm16_payload(x.audioPcm16Base64)
    try:
        result = await ctx.state.transcription_session_manager.append_audio(
            scope_id=ctx.session_id,
            session_id=x.sessionId,
            audio_pcm16=audio_pcm16,
            sample_rate_hz=x.sampleRateHz,
            channels=x.channels,
        )
    except TranscriptionSessionNotFoundError as exc:
        detail = (
            exc.args[0]
            if exc.args and isinstance(exc.args[0], str)
            else "Transcription session not found."
        )
        _raise_transcription_http_error(
            status_code=404,
            message=detail,
            error_code=TranscriptionErrorCode.session_not_found,
        )
    except TranscriptionAudioLimitExceededError as exc:
        _raise_transcription_http_error(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            message=_build_audio_payload_too_large_detail(exc.max_bytes),
            error_code=TranscriptionErrorCode.audio_payload_too_large,
        )
    except ValueError as exc:
        _raise_transcription_http_error(
            status_code=400,
            message=str(exc),
            error_code=TranscriptionErrorCode.invalid_request,
        )
    except Exception as exc:
        detail = (
            get_user_facing_llm_error_message(exc) or "Provider transcription failed."
        )
        _raise_transcription_http_error(
            status_code=502,
            message=detail,
            error_code=TranscriptionErrorCode.provider_failure,
        )
    return _to_transcription_delta_response(
        append_text=result.append_text,
        full_text=result.full_text,
        is_final=False,
    )


@router.post(Route.STOP_TRANSCRIPTION_SESSION)
async def route_stop_transcription_session(
    x: StopTranscriptionSessionRequest,
    ctx: RuntimeContextFromRequest,
) -> TranscriptionSessionDeltaResponse:
    await ctx.enforce_llm_allowed()
    try:
        result = await ctx.state.transcription_session_manager.stop_session(
            scope_id=ctx.session_id,
            session_id=x.sessionId,
        )
    except TranscriptionSessionNotFoundError as exc:
        detail = (
            exc.args[0]
            if exc.args and isinstance(exc.args[0], str)
            else "Transcription session not found."
        )
        _raise_transcription_http_error(
            status_code=404,
            message=detail,
            error_code=TranscriptionErrorCode.session_not_found,
        )
    except ValueError as exc:
        _raise_transcription_http_error(
            status_code=400,
            message=str(exc),
            error_code=TranscriptionErrorCode.invalid_request,
        )
    except Exception as exc:
        detail = (
            get_user_facing_llm_error_message(exc) or "Provider transcription failed."
        )
        _raise_transcription_http_error(
            status_code=502,
            message=detail,
            error_code=TranscriptionErrorCode.provider_failure,
        )
    return _to_transcription_delta_response(
        append_text=result.append_text,
        full_text=result.full_text,
        is_final=True,
    )


@router.post(Route.CANCEL_TRANSCRIPTION_SESSION)
async def route_cancel_transcription_session(
    x: CancelTranscriptionSessionRequest,
    ctx: RuntimeContextFromRequest,
) -> CancelTranscriptionSessionResponse:
    await ctx.enforce_llm_allowed()
    try:
        await ctx.state.transcription_session_manager.cancel_session(
            scope_id=ctx.session_id,
            session_id=x.sessionId,
        )
    except KeyError:
        return CancelTranscriptionSessionResponse(ok=True)
    return CancelTranscriptionSessionResponse(ok=True)


@router.post(Route.STOP_LLM_CHAT)
async def route_stop_llm_chat(
    x: StopLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> StopLLMChatResponse:
    await ctx.enforce_llm_allowed()
    runs = _get_llm_chat_runs(dbe=ctx.state.dbe, chat_id=x.chatId)
    running_runs = [run for run in runs if run.status == AgentRunStatus.running]
    latest_run = _select_latest_run(running_runs)
    if latest_run is None:
        return StopLLMChatResponse(alreadyStopped=True)
    stopped_run = await ctx.state.agent_runner.stop_run(latest_run.id)
    if stopped_run.status != AgentRunStatus.cancelled:
        return StopLLMChatResponse(alreadyStopped=True)
    return StopLLMChatResponse(
        alreadyStopped=False,
        stoppedRunId=stopped_run.id,
        stoppedMessageId=_resolve_latest_assistant_message_id_from_run(stopped_run),
    )


@router.post(Route.GET_LLM_CHAT)
async def route_get_llm_chat(
    x: GetLLMChatRequest,
    ctx: RuntimeContextFromRequest,
) -> GetLLMChatRequestResponse:
    await ctx.enforce_llm_allowed()
    runs = _get_llm_chat_runs(
        dbe=ctx.state.dbe,
        chat_id=x.chatId,
        project_config_id=x.projectConfigId,
    )
    latest_run = _select_latest_run(runs)
    if latest_run is None:
        _raise_chat_hydration_http_error(
            status_code=404,
            message="Chat not found.",
            error_code=ChatHydrationErrorCode.chat_not_found,
        )
    state = build_chat_state_from_run(latest_run)
    if latest_run.status == AgentRunStatus.running:
        live_state = ctx.state.agent_runner.get_live_chat_state(latest_run.id)
        if live_state is not None:
            state = live_state
    llm_config: LLMConfig | None = None
    engine_config_id = get_run_engine_config_id(latest_run)
    if engine_config_id:
        try:
            engine_config = require_engine_config(ctx.state.dbe, engine_config_id)
        except KeyError:
            engine_config = None
        if (
            engine_config is not None
            and engine_config.engineType == EngineType.setta_llm
            and engine_config.settaLlmConfigId
        ):
            try:
                llm_config = ctx.state.agent_runner.config.resolve_config(
                    engine_config.settaLlmConfigId
                )
            except ValueError:
                llm_config = None
    context_usage = resolve_internal_run_context_usage(latest_run)
    return GetLLMChatRequestResponse(
        messages=state.messages,
        waitingForResponse=state.waitingForResponse,
        llmConfig=llm_config,
        contextUsage=_to_chat_context_usage(context_usage),
        appGenerationByMessageId=_get_run_app_generation_by_message_id(latest_run),
    )


@router.post(Route.GET_EXTERNAL_AGENT_CHAT)
async def route_get_external_agent_chat(
    x: GetExternalAgentChatRequest,
    ctx: RuntimeContextFromRequest,
) -> GetExternalAgentChatResponse:
    await ctx.enforce_llm_allowed()
    runs = _get_external_agent_chat_runs(
        dbe=ctx.state.dbe,
        chat_id=x.chatId,
        project_config_id=x.projectConfigId,
    )
    latest_run = _select_latest_run(runs)
    if latest_run is None:
        _raise_chat_hydration_http_error(
            status_code=404,
            message="Chat not found.",
            error_code=ChatHydrationErrorCode.chat_not_found,
        )
    state = build_chat_state_from_run(latest_run)
    if latest_run.status == AgentRunStatus.running:
        runner = ctx.state.external_agent_runner
        if not runner.disabled:
            live_state = runner.get_live_chat_state(latest_run.id)
            if live_state is not None:
                state = live_state
    context_usage = resolve_external_run_context_usage(latest_run)
    return GetExternalAgentChatResponse(
        messages=state.messages,
        waitingForResponse=state.waitingForResponse,
        toolCallArguments=state.toolCallArguments,
        contextUsage=_to_chat_context_usage(context_usage),
        appGenerationByMessageId=_get_run_app_generation_by_message_id(latest_run),
    )


@router.post(Route.GET_AI_FOLLOW_SNAPSHOT)
@require_project_context()
async def route_get_ai_follow_snapshot(
    x: GetAIFollowSnapshotRequest,
    ctx: RuntimeContextFromRequest,
) -> list[AIFollowToolArgumentsUpdateContent]:
    await ctx.enforce_llm_allowed()
    snapshot = ctx.state.agent_runner.get_ai_follow_snapshot(x.projectConfigId)
    external_runner = ctx.state.external_agent_runner
    if external_runner and not external_runner.disabled:
        snapshot.extend(external_runner.get_ai_follow_snapshot(x.projectConfigId))
    return snapshot
