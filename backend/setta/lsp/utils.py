import logging

from .specific_file_watcher import SpecificFileWatcher

logger = logging.getLogger(__name__)


def create_specific_file_watcher(websocket_message_handler):
    async def callback(event_info):
        logger.debug(f"callback {event_info}")
        await websocket_message_handler.broadcast_file_updates(event_info)

    return SpecificFileWatcher(callback)
