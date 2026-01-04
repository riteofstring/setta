from pathlib import Path
from typing import TYPE_CHECKING

from fastapi import HTTPException, WebSocket, status

from setta.project_state.session_project_manager import SessionPersistenceMode
from setta.runtime.scoped_sender import ScopedFrontendSender
from setta.share.policy import (
    enforce_share_policy,
    ensure_share_llm_allowed,
    ensure_share_lsp_allowed,
    ensure_share_mcp_allowed,
    ensure_share_run_allowed,
    ensure_share_run_allowed_ws,
)
from setta.types.share_deployment import SharePolicy

if TYPE_CHECKING:
    from setta.project_state.base_project_manager import BaseProjectManager
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
        self.scoped_frontend_sender = ScopedFrontendSender(
            state.wmh_frontend_sender,
            share_session_id if state.share_mode else None,
        )

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
            return self.state.share_project_manager.share_policy
        return SharePolicy()

    @property
    def persistence_mode(self) -> SessionPersistenceMode:
        if self.state.share_mode:
            return SessionPersistenceMode.share
        return SessionPersistenceMode.ide_main

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
            return self.state.project_manager_switcher.get_for_session(self.session_id)
        return self.state.project_manager_switcher.get(project_config_id)

    async def enforce_policy(
        self,
        *,
        policy_flag: str,
        denied_message: str,
        project_config_id: "ID | None",
        section_ids: list["ID"] | None = None,
    ) -> None:
        await enforce_share_policy(
            share_mode=self.state.share_mode,
            policy=self.policy,
            frontend_sender=self.state.wmh_frontend_sender,
            policy_flag=policy_flag,
            denied_message=denied_message,
            project_config_id=project_config_id,
            share_session_id=self._share_session_id,
            section_ids=section_ids,
        )

    async def enforce_param_changes_allowed(
        self,
        *,
        project_config_id: "ID | None",
        section_ids: list["ID"] | None = None,
    ) -> None:
        await self.enforce_policy(
            policy_flag="allowParamChanges",
            denied_message="Share policy disallows parameter changes.",
            project_config_id=project_config_id,
            section_ids=section_ids,
        )

    async def enforce_variant_changes_allowed(
        self,
        *,
        project_config_id: "ID | None",
        section_ids: list["ID"] | None = None,
    ) -> None:
        await self.enforce_policy(
            policy_flag="allowVariantChanges",
            denied_message="Share policy disallows variant changes.",
            project_config_id=project_config_id,
            section_ids=section_ids,
        )

    async def enforce_layout_changes_allowed(
        self,
        *,
        project_config_id: "ID | None",
        section_ids: list["ID"] | None = None,
    ) -> None:
        await self.enforce_policy(
            policy_flag="allowLayoutChanges",
            denied_message="Share policy disallows layout changes.",
            project_config_id=project_config_id,
            section_ids=section_ids,
        )

    async def enforce_structural_changes_allowed(
        self,
        *,
        project_config_id: "ID | None",
        section_ids: list["ID"] | None = None,
    ) -> None:
        await self.enforce_policy(
            policy_flag="allowStructuralChanges",
            denied_message="Share policy disallows structural changes.",
            project_config_id=project_config_id,
            section_ids=section_ids,
        )

    async def enforce_run_allowed(
        self,
        *,
        project_config_id: "ID | None",
        section_ids: list["ID"] | None = None,
    ) -> None:
        await ensure_share_run_allowed(
            self.state,
            project_config_id=project_config_id,
            share_session_id=self._share_session_id,
            section_ids=section_ids,
        )

    async def enforce_run_allowed_ws(
        self,
        websocket: WebSocket,
        *,
        project_config_id: "ID | None",
        section_ids: list["ID"] | None = None,
    ) -> bool:
        return await ensure_share_run_allowed_ws(
            self.state,
            websocket,
            project_config_id=project_config_id,
            share_session_id=self._share_session_id,
            section_ids=section_ids,
        )

    async def enforce_lsp_allowed(
        self,
        *,
        project_config_id: "ID | None",
    ) -> None:
        await ensure_share_lsp_allowed(
            self.state,
            project_config_id=project_config_id,
            share_session_id=self._share_session_id,
        )

    async def enforce_llm_allowed(
        self,
        *,
        project_config_id: "ID | None",
    ) -> None:
        await ensure_share_llm_allowed(
            self.state,
            project_config_id=project_config_id,
            share_session_id=self._share_session_id,
        )

    async def enforce_mcp_allowed(
        self,
        *,
        project_config_id: "ID | None",
    ) -> None:
        await ensure_share_mcp_allowed(
            self.state,
            project_config_id=project_config_id,
            share_session_id=self._share_session_id,
        )

    async def ensure_lsp_ready(
        self,
        manager: "BaseProjectManager",
    ) -> None:
        if not self.state.share_mode:
            return
        if not self.policy.allowLSP:
            return
        await manager.ensure_gen_code_ready()
