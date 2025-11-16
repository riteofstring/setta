"""File watcher plumbing for ``setta_files/llm_config.json``."""

from pathlib import Path

from setta.file_watchers.specific_file_watcher import SpecificFileWatcher
from setta.llm.config_store import config_to_payload, load_llm_config
from setta.llm.constants import CONFIG_PATH
from setta.types.llm_config import LLMConfigPayload
from setta.types.specific_file_watcher import FileWatcherCoreUpdate
from setta.utils.utils import normalize_path
from setta.websockets.msg_handlers.frontend_sender import WMHFrontendSender

LLM_CONFIG_CALLBACK_CATEGORY = "llm_config"


def register_llm_config_watch(
    frontend_sender: WMHFrontendSender,
    specific_file_watcher: SpecificFileWatcher,
    *,
    config_path: Path | None = None,
) -> None:
    """Subscribe to changes in the LLM config file and broadcast updates."""

    resolved_path = (config_path or CONFIG_PATH).resolve()
    normalized_path = normalize_path(resolved_path)

    async def _handle_config_update(_: FileWatcherCoreUpdate) -> None:
        config = load_llm_config(config_path=resolved_path)
        payload: LLMConfigPayload = config_to_payload(config)
        await frontend_sender.broadcast_llm_config(payload)

    specific_file_watcher.update_callbacks(
        {normalized_path: _handle_config_update},
        LLM_CONFIG_CALLBACK_CATEGORY,
        fire_immediately=[normalized_path],
    )
