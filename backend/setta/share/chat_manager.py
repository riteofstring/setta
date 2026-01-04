from typing import TYPE_CHECKING

from setta.database.db_objs import DBE
from setta.llm.api_keys import filter_env_vars_for_config
from setta.llm.chat_store import MemoryChatStore
from setta.llm.config import load_llm_config
from setta.llm.llm_chat_manager import LLMChatManager
from setta.mcp.noop_client import NoopMCPClient
from setta.project_state.project_state_summary_types import ProjectStateSummary
from setta.runtime.scoped_sender import ScopedFrontendSender
from setta.types.helpers_lvl3 import build_project_state_summary
from setta.types.id import ID
from setta.types.llm_config import AllLLMConfigs
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:
    from setta.mcp.client import MultiMCPClient
    from setta.project_state.share_project_manager import ShareProjectManager
    from setta.share.session_store import ShareSessionStore
    from setta.types.chat import APIKeys, Chat
    from setta.types.generated.chat_messages import BaseChatMessageUnion


class ShareChatManager:
    def __init__(
        self,
        dbe: DBE,
        frontend_sender: WMHFrontendSender,
        share_project_manager: "ShareProjectManager",
        share_session_store: "ShareSessionStore",
        *,
        mcp_client: "MultiMCPClient | None" = None,
        llm_config: AllLLMConfigs | None = None,
        api_keys: "APIKeys | None" = None,
    ) -> None:
        self.dbe = dbe
        self.frontend_sender = frontend_sender
        self.share_project_manager = share_project_manager
        self.share_session_store = share_session_store
        self._noop_mcp_client = NoopMCPClient()
        self._mcp_client = mcp_client

        config = llm_config or load_llm_config(dbe, allow_write=False)
        self.config = config
        self._raw_env_vars: "APIKeys" = (
            api_keys if api_keys is not None else dbe.read_dot_env()
        )
        self.api_keys = filter_env_vars_for_config(self._raw_env_vars, self.config)
        self._managers: dict[str, LLMChatManager] = {}

    def _require_share_session_id(self, share_session_id: str | None) -> str:
        if share_session_id is None:
            raise KeyError("Missing share session id")
        return share_session_id

    def _resolve_mcp_client(self):
        if self._mcp_client is None:
            return self._noop_mcp_client
        return self._mcp_client

    def _build_summary_provider(self, share_session_id: str):
        async def provider(project_config_id: ID) -> ProjectStateSummary:
            if project_config_id != self.share_project_manager.project_config_id:
                raise KeyError(f"Unknown project config: {project_config_id}")
            project_state = self.share_project_manager.get_session_state(
                share_session_id
            )
            return build_project_state_summary(project_state)

        return provider

    def _get_or_create_manager(self, share_session_id: str) -> LLMChatManager:
        if share_session_id not in self._managers:
            self.share_session_store.get_session(share_session_id)
            self.share_project_manager.get_or_create_session_state(share_session_id)
            session_sender = ScopedFrontendSender(
                self.frontend_sender, share_session_id
            )
            summary_provider = self._build_summary_provider(share_session_id)
            manager = LLMChatManager(
                self.dbe,
                self._resolve_mcp_client(),
                session_sender,
                project_manager_switcher=None,
                chat_store=MemoryChatStore(),
                share_session_id=share_session_id,
                project_summary_provider=summary_provider,
            )
            manager.update_config(self.config)
            manager.update_api_keys(self._raw_env_vars)
            self._managers[share_session_id] = manager
        return self._managers[share_session_id]

    def update_config(self, config: AllLLMConfigs) -> None:
        self.config = config
        self.api_keys = filter_env_vars_for_config(self._raw_env_vars, self.config)
        for manager in self._managers.values():
            manager.update_config(config)
            manager.update_api_keys(self._raw_env_vars)

    def update_api_keys(self, payload: "APIKeys") -> None:
        self._raw_env_vars = dict(payload)
        self.api_keys = filter_env_vars_for_config(self._raw_env_vars, self.config)
        for manager in self._managers.values():
            manager.update_api_keys(self._raw_env_vars)

    def drop_session(self, share_session_id: str) -> None:
        if share_session_id not in self._managers:
            return
        self._managers.pop(share_session_id, None)

    def get_chat(
        self,
        chat_id: ID,
        share_session_id: str | None = None,
    ) -> "Chat | None":
        session_id = self._require_share_session_id(share_session_id)
        return self._get_or_create_manager(session_id).get_chat(chat_id)

    def get_or_create_chat(
        self,
        chat_id: ID | None,
        message: "BaseChatMessageUnion",
        llm_config_id: str,
        project_config_id: ID,
        share_session_id: str | None = None,
    ) -> "Chat":
        session_id = self._require_share_session_id(share_session_id)
        return self._get_or_create_manager(session_id).get_or_create_chat(
            chat_id,
            message,
            llm_config_id,
            project_config_id,
        )

    def get_all_chat_metadata(self, share_session_id: str | None = None):
        session_id = self._require_share_session_id(share_session_id)
        return self._get_or_create_manager(session_id).get_all_chat_metadata()

    def delete_chat(self, chat_id: ID, share_session_id: str | None = None) -> None:
        session_id = self._require_share_session_id(share_session_id)
        self._get_or_create_manager(session_id).delete_chat(chat_id)

    def start_processing_query(
        self,
        chat: "Chat",
        deepThink: bool,
        share_session_id: str | None = None,
    ) -> None:
        session_id = self._require_share_session_id(share_session_id)
        self._get_or_create_manager(session_id).start_processing_query(chat, deepThink)

    async def request_stop_streaming(
        self, chat_id: ID, share_session_id: str | None = None
    ) -> None:
        session_id = self._require_share_session_id(share_session_id)
        await self._get_or_create_manager(session_id).request_stop_streaming(chat_id)

    def is_waiting_for_response(
        self, chat_id: ID, share_session_id: str | None = None
    ) -> bool:
        session_id = self._require_share_session_id(share_session_id)
        return self._get_or_create_manager(session_id).is_waiting_for_response(chat_id)

    def get_current_stream(
        self, chat_id: ID, share_session_id: str | None = None
    ) -> list["BaseChatMessageUnion"]:
        session_id = self._require_share_session_id(share_session_id)
        return self._get_or_create_manager(session_id).get_current_stream(chat_id)

    def get_ai_follow_snapshot(
        self,
        project_config_id: ID,
        share_session_id: str | None = None,
    ):
        session_id = self._require_share_session_id(share_session_id)
        return self._get_or_create_manager(session_id).get_ai_follow_snapshot(
            project_config_id
        )
