"""File watcher plumbing for ``setta_files/llm_config.json``."""

from pathlib import Path
from typing import TYPE_CHECKING

from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.llm.config_store import LLMConfig, config_to_payload, load_llm_config
from setta.llm.constants import CONFIG_PATH
from setta.types.llm_config import LLMConfigPayload
from setta.types.specific_file_watcher import FileWatcherCoreUpdate
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

if TYPE_CHECKING:
    from setta.mcp.chat_manager import ChatManager

LLM_CONFIG_CALLBACK_CATEGORY = "llm_config"


def register_llm_config_watch(
    frontend_sender: WMHFrontendSender,
    specific_file_watcher: SpecificFileWatcher,
    llm_config: LLMConfig,
    chat_manager: "ChatManager",
    *,
    config_path: Path | None = None,
) -> None:
    """Subscribe to config file changes, broadcasting and updating backend state."""

    resolved_path = (config_path or CONFIG_PATH).resolve()
    normalized_path = normalize_path(resolved_path)

    async def _handle_config_update(_: FileWatcherCoreUpdate) -> None:
        updated = load_llm_config(config_path=resolved_path)
        _apply_config_update(llm_config, updated)
        chat_manager.update_llm_config(llm_config)
        payload: LLMConfigPayload = config_to_payload(llm_config)
        await frontend_sender.broadcast_llm_config(payload)

    specific_file_watcher.update_callbacks(
        {normalized_path: _handle_config_update},
        LLM_CONFIG_CALLBACK_CATEGORY,
        fire_immediately=[normalized_path],
    )


def _apply_config_update(target: LLMConfig, source: LLMConfig) -> None:
    """Replace the contents of ``target`` with the values from ``source``."""

    target.gateway_url = source.gateway_url
    target.providers = source.providers
    target.project_configs = source.project_configs
    target.default_project_config_id = source.default_project_config_id
