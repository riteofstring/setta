from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import HTTPException, WebSocket, status

from setta.share.policy import (
    enforce_share_policy,
    ensure_share_download_allowed,
    ensure_share_llm_allowed,
    ensure_share_multiple_runs_allowed,
    ensure_share_run_allowed,
    ensure_share_run_allowed_ws,
)
from setta.types.share_deployment import SharePolicy

if TYPE_CHECKING:
    from setta.server_state import SettaFastAPIState
    from setta.types.id import ID
    from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender


class RuntimeContext:
    def __init__(
        self, state: "SettaFastAPIState", *, share_session_id: str | None = None
    ) -> None:
        self.state = state
        self._share_session_id = share_session_id
        if state.share_mode and share_session_id is None:
            raise KeyError("Missing share session id")

    @property
    def share_mode(self) -> bool:
        return self.state.share_mode

    @property
    def session_id(self) -> str:
        if self.state.share_mode:
            if self._share_session_id is None:
                raise KeyError("Missing share session id")
            return self._share_session_id
        return "main"

    @property
    def share_session_id(self) -> str | None:
        return self._share_session_id

    @property
    def policy(self) -> SharePolicy:
        if self.state.share_mode:
            return self.state.share_runtime_state.share_policy
        return SharePolicy()

    @property
    def deployment_root(self) -> Path | None:
        if self.state.share_mode:
            return self.state.share_deployment_root
        return None

    @property
    def frontend_sender(self) -> "WMHFrontendSender":
        return self.state.wmh_frontend_sender

    def require_ide_mode(self, message: str) -> None:
        if self.state.share_mode:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=message,
            )

    def get_project_manager(self, project_config_id: "ID"):
        if self.state.share_mode:
            return self.state.project_manager_switcher.get(
                project_config_id,
                share_session_id=self.session_id,
            )
        return self.state.project_manager_switcher.get(project_config_id)

    async def enforce_policy(
        self,
        *,
        policy_flag: str,
        denied_message: str,
    ) -> None:
        await enforce_share_policy(
            share_mode=self.state.share_mode,
            policy=self.policy,
            frontend_sender=self.state.wmh_frontend_sender,
            policy_flag=policy_flag,
            denied_message=denied_message,
            share_session_id=self._share_session_id,
        )

    async def enforce_run_allowed(
        self,
    ) -> None:
        await ensure_share_run_allowed(
            self.state,
            share_session_id=self._share_session_id,
        )

    async def enforce_multiple_runs_allowed(self) -> None:
        await ensure_share_multiple_runs_allowed(
            self.state,
            share_session_id=self._share_session_id,
        )

    async def enforce_run_allowed_ws(
        self,
        websocket: WebSocket,
    ) -> bool:
        return await ensure_share_run_allowed_ws(
            self.state,
            websocket,
            share_session_id=self._share_session_id,
        )

    async def enforce_download_allowed(self) -> None:
        await ensure_share_download_allowed(
            self.state,
            share_session_id=self._share_session_id,
        )

    async def enforce_llm_allowed(self) -> None:
        await ensure_share_llm_allowed(
            self.state,
            share_session_id=self._share_session_id,
        )
