from collections.abc import Callable
from dataclasses import dataclass
from typing import Literal

from mcp.server.fastmcp.server import Context

from setta.mcp.ui_settings_context import (
    resolve_chat_id_from_ctx,
    resolve_frontend_websocket_affinity_from_ctx,
    resolve_share_session_id_from_ctx,
)
from setta.types.id import ID
from setta.types.websocket import (
    UISettingRevealContent,
    UISettingRevealResultStatus,
    UISettingRevealTarget,
)
from setta.ui_settings.reveal_result_hub import (
    RevealResultContractMismatchError,
    RevealResultTransportDisconnectedError,
    UISettingRevealResultHub,
)


@dataclass(frozen=True, slots=True)
class UISettingRevealResolvedContext:
    scope: Literal["ide", "share"]
    project_config_id: ID
    share_session_id: str | None
    chat_id: ID | None
    frontend_websocket_id: str | None


@dataclass(frozen=True, slots=True)
class UISettingRevealDispatchResult:
    frontend_status: UISettingRevealResultStatus | None = None
    error_message: str | None = None


class UISettingRevealCoordinator:
    def __init__(
        self,
        *,
        ctx: Context,
        project_config_id: ID,
        timeout_seconds_resolver: Callable[[int], float] | None = None,
    ) -> None:
        self._ctx = ctx
        self._project_config_id = project_config_id
        self._frontend_sender = ctx.fastmcp.state.wmh_frontend_sender
        self._reveal_result_hub: UISettingRevealResultHub = (
            ctx.fastmcp.state.ui_setting_reveal_result_hub
        )
        self._timeout_seconds_resolver = (
            timeout_seconds_resolver
            if timeout_seconds_resolver is not None
            else _resolve_frontend_reveal_timeout_seconds
        )

    async def dispatch_and_wait_for_single_target(
        self,
        *,
        request_id: str,
        bounded_duration_ms: int,
        target: UISettingRevealTarget,
        active_section_id: ID | None,
    ) -> UISettingRevealDispatchResult:
        resolved_context_or_error = self._resolve_context()
        if isinstance(resolved_context_or_error, str):
            return UISettingRevealDispatchResult(
                error_message=resolved_context_or_error
            )
        resolved_context = resolved_context_or_error
        (
            target_websocket_id,
            websocket_resolution_error,
        ) = self._resolve_target_websocket_id(resolved_context)
        if websocket_resolution_error is not None:
            return UISettingRevealDispatchResult(
                error_message=websocket_resolution_error
            )
        if target_websocket_id is None:
            return UISettingRevealDispatchResult(
                error_message="No connected frontend is available for UI setting reveal."
            )
        self._reveal_result_hub.register_request(
            request_id,
            expected_websocket_id=target_websocket_id,
            expected_project_config_id=resolved_context.project_config_id,
            expected_setting_ids={target.settingId},
        )
        delivered_websocket_id = (
            await self._frontend_sender.broadcast_ui_setting_reveal(
                UISettingRevealContent(
                    projectConfigId=resolved_context.project_config_id,
                    chatId=resolved_context.chat_id,
                    reveals=[target],
                    durationMs=bounded_duration_ms,
                    requestId=request_id,
                    activeSectionId=active_section_id,
                ),
                share_session_id=resolved_context.share_session_id,
                target_websocket_id=target_websocket_id,
            )
        )
        if delivered_websocket_id is None:
            self._reveal_result_hub.cancel_request(request_id)
            dispatch_failure_message = (
                "Selected frontend websocket became unavailable before reveal "
                f"dispatch: {target_websocket_id}"
            )
            if resolved_context.frontend_websocket_id is not None:
                dispatch_failure_message = (
                    "Requested frontend affinity token became unavailable before "
                    "reveal dispatch: "
                    f"{resolved_context.frontend_websocket_id}"
                )
            return UISettingRevealDispatchResult(error_message=dispatch_failure_message)
        try:
            frontend_reveal_result = await self._reveal_result_hub.wait_for_result(
                request_id=request_id,
                timeout_seconds=self._timeout_seconds_resolver(bounded_duration_ms),
            )
        except RevealResultContractMismatchError as exc:
            return UISettingRevealDispatchResult(error_message=str(exc))
        except RevealResultTransportDisconnectedError as exc:
            return UISettingRevealDispatchResult(
                error_message=(
                    "Selected frontend websocket disconnected before reveal "
                    f"confirmation: {exc.websocket_id}"
                )
            )
        if frontend_reveal_result is None:
            return UISettingRevealDispatchResult(
                error_message=(
                    "Timed out waiting for frontend reveal confirmation for "
                    f"{target.settingId}."
                )
            )
        for status in frontend_reveal_result.statuses:
            if status.settingId == target.settingId:
                return UISettingRevealDispatchResult(frontend_status=status)
        return UISettingRevealDispatchResult(
            error_message=(
                "Frontend reveal response did not include status for "
                f"{target.settingId}."
            )
        )

    def _resolve_context(self) -> UISettingRevealResolvedContext | str:
        share_session_id = resolve_share_session_id_from_ctx(self._ctx)
        scope: Literal["ide", "share"] = "share" if share_session_id else "ide"
        frontend_affinity_resolution = resolve_frontend_websocket_affinity_from_ctx(
            self._ctx
        )
        if frontend_affinity_resolution.error_message is not None:
            return frontend_affinity_resolution.error_message
        return UISettingRevealResolvedContext(
            scope=scope,
            project_config_id=self._project_config_id,
            share_session_id=share_session_id,
            chat_id=resolve_chat_id_from_ctx(self._ctx),
            frontend_websocket_id=frontend_affinity_resolution.frontend_websocket_id,
        )

    def _resolve_target_websocket_id(
        self,
        resolved_context: UISettingRevealResolvedContext,
    ) -> tuple[str | None, str | None]:
        available_frontend_websocket_ids = (
            self._frontend_sender.list_frontend_websocket_ids_for_ui_setting_reveal(
                share_session_id=resolved_context.share_session_id
            )
        )
        if (
            resolved_context.frontend_websocket_id is None
            and len(available_frontend_websocket_ids) > 1
        ):
            if resolved_context.scope == "ide":
                return None, (
                    "Reveal routing is ambiguous because multiple frontends are "
                    "connected and no frontendAffinityToken was provided."
                )
            return None, (
                "Reveal routing is ambiguous because multiple frontends are "
                "connected and no origin frontend affinity is available."
            )
        target_websocket_id = (
            self._frontend_sender.select_frontend_websocket_for_ui_setting_reveal(
                share_session_id=resolved_context.share_session_id,
                preferred_websocket_id=resolved_context.frontend_websocket_id,
            )
        )
        if target_websocket_id is None:
            if resolved_context.frontend_websocket_id is not None:
                return None, (
                    "Requested frontend affinity token is unavailable for UI setting "
                    "reveal: "
                    f"{resolved_context.frontend_websocket_id}"
                )
            if resolved_context.share_session_id is not None:
                return None, (
                    "No connected frontend is available for UI setting reveal in the "
                    "requested share session."
                )
            return None, "No connected frontend is available for UI setting reveal."
        return target_websocket_id, None


def _resolve_frontend_reveal_timeout_seconds(duration_ms: int) -> float:
    timeout_seconds = (duration_ms / 1000.0) + 1.5
    if timeout_seconds < 3.0:
        return 3.0
    if timeout_seconds > 12.0:
        return 12.0
    return timeout_seconds
