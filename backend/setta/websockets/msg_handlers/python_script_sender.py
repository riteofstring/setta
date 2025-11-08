import logging
from typing import TYPE_CHECKING, Iterable

from setta.types.listener import (
    ListenerForceRefreshContent,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.websocket import (
    WebsocketMsgListenerForceRefresh,
    WebsocketMsgListenerRealtimeEvent,
)
from setta.websockets.listener_registry import ListenerRegistry
from setta.websockets.msg_handlers.base import BaseWebsocketMsgSender

if TYPE_CHECKING:
    from setta.websockets.realtime_event_hub import RealtimeEventHub

logger = logging.getLogger(__name__)


class WMHPythonScriptSender(BaseWebsocketMsgSender):
    def __init__(
        self,
        websocket_manager,
        listener_registry: ListenerRegistry,
    ):
        super().__init__(websocket_manager)
        self.listener_registry = listener_registry
        self._realtime_event_hub: "RealtimeEventHub" | None = None

    def register_realtime_event_hub(self, event_hub: "RealtimeEventHub") -> None:
        self._realtime_event_hub = event_hub

    async def send_realtime_update(
        self,
        *,
        projectConfigId: str,
        deltas: list[ListenerRealtimeDelta],
        sequence: int,
    ):
        if not deltas:
            raise ValueError("deltas must contain at least one entry")
        content = ListenerRealtimeEventContent(
            projectConfigId=projectConfigId,
            deltas=deltas,
            sequence=sequence,
        )
        logger.debug(
            "sending listener realtime event for project config %s (sequence=%s)",
            projectConfigId,
            sequence,
        )
        sockets_to_notify = set()
        for (
            registration,
            matching_callbacks,
        ) in self.listener_registry.iter_callbacks_matching_dependencies(
            project_config_id=projectConfigId,
            dependency_keys=(delta.dependency for delta in deltas),
        ):
            if matching_callbacks:
                sockets_to_notify.add(registration.websocket_id)

        if not sockets_to_notify:
            logger.debug(
                "no listener sockets registered for realtime dependencies %s "
                "(project config %s)",
                [delta.dependency for delta in deltas],
                projectConfigId,
            )
            return

        message = WebsocketMsgListenerRealtimeEvent(content=content)
        for websocket_id in sockets_to_notify:
            await self.websocket_manager.send_message(message, websocket_id)

    async def send_force_refresh(
        self,
        *,
        projectState: ProjectStateSingleConfig | None = None,
        projectConfigId: str | None = None,
        targetWebsocketIds: Iterable[str] | None = None,
    ):
        project_config_id = projectConfigId
        if projectState is not None:
            project_config_id = projectState.projectConfig.id
        if project_config_id is None:
            raise ValueError(
                "projectState or projectConfigId must provide a project id for force refresh"
            )

        socket_ids: list[str]
        if targetWebsocketIds is not None:
            socket_ids = list(targetWebsocketIds)
        else:
            socket_ids = list(
                self.listener_registry.iter_socket_ids_for_project(project_config_id)
            )

        if not socket_ids:
            logger.debug(
                "no python script sockets recorded for force refresh (project config %s)",
                project_config_id,
            )
            if self._realtime_event_hub is not None:
                self._realtime_event_hub.reset_sequence(project_config_id)
            return

        if self._realtime_event_hub is not None:
            self._realtime_event_hub.reset_sequence(project_config_id)

        content = ListenerForceRefreshContent(
            projectState=projectState,
        )
        message = WebsocketMsgListenerForceRefresh(content=content)
        logger.debug(
            "sending listener force refresh for project config %s to %s socket(s)",
            project_config_id,
            len(socket_ids),
        )
        for websocket_id in socket_ids:
            await self.websocket_manager.send_message(message, websocket_id)
