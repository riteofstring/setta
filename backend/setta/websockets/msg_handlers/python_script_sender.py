import logging
from typing import TYPE_CHECKING, Iterable

from setta.database.db_objs import DBE
from setta.mcp.utils import convert_canonical_ids_to_temporary
from setta.types.id import (
    ID,
    CanonicalToTemporaryIDMap,
    TemporaryToCanonicalIDMap,
)
from setta.types.listener import (
    DependencyEvent,
    DependencyEventType,
    ListenerDependencyEventContent,
    ListenerForceRefreshContent,
    ListenerRealtimeDelta,
    ListenerRealtimeEventContent,
)
from setta.types.project_state import ProjectStateSingleConfig
from setta.types.websocket import (
    WebsocketMsgListenerDependencyEvent,
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
        dbe: DBE | None = None,
    ):
        super().__init__(websocket_manager)
        self.listener_registry = listener_registry
        self.dbe = dbe
        self._realtime_event_hub: "RealtimeEventHub | None" = None
        self._temporary_id_map_mtime_ns: int | None = None
        self._temporary_to_canonical: TemporaryToCanonicalIDMap = {}
        self._canonical_to_temporary: CanonicalToTemporaryIDMap = {}

    def register_realtime_event_hub(self, event_hub: "RealtimeEventHub") -> None:
        self._realtime_event_hub = event_hub

    def _refresh_temporary_id_map_if_needed(self) -> None:
        if self.dbe is None:
            return
        path = self.dbe.temporary_id_map
        mtime_ns = path.stat().st_mtime_ns if path.exists() else None
        if mtime_ns == self._temporary_id_map_mtime_ns:
            return
        (
            self._temporary_to_canonical,
            self._canonical_to_temporary,
        ) = self.dbe.read_temporary_id_map()
        self._temporary_id_map_mtime_ns = mtime_ns

    def _convert_outgoing_to_temporary(self, payload):
        if self.dbe is None:
            return payload
        self._refresh_temporary_id_map_if_needed()
        map_size_before = len(self._canonical_to_temporary)
        converted = convert_canonical_ids_to_temporary(
            payload,
            self._canonical_to_temporary,
            self._temporary_to_canonical,
        )
        if len(self._canonical_to_temporary) != map_size_before:
            self.dbe.write_temporary_id_map(self._canonical_to_temporary)
            self._temporary_id_map_mtime_ns = (
                self.dbe.temporary_id_map.stat().st_mtime_ns
            )
        return converted

    async def send_realtime_update(
        self,
        *,
        projectConfigId: ID,
        deltas: list[ListenerRealtimeDelta],
        sequence: int,
        share_session_id: str | None = None,
    ):
        if not deltas:
            raise ValueError("deltas must contain at least one entry")
        content = ListenerRealtimeEventContent(
            projectConfigId=projectConfigId,
            shareSessionId=share_session_id,
            deltas=deltas,
            sequence=sequence,
        )
        logger.debug(
            "sending listener realtime event for project config %s (sequence=%s session=%s)",
            projectConfigId,
            sequence,
            share_session_id,
        )
        sockets_to_notify = set()
        for (
            registration,
            matching_callbacks,
        ) in self.listener_registry.iter_callbacks_matching_dependencies(
            project_config_id=projectConfigId,
            dependency_keys=(delta.dependency for delta in deltas),
            event_type=DependencyEventType.VALUE,
            share_session_id=share_session_id,
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
        temporary_message = None
        for websocket_id in sockets_to_notify:
            if self.listener_registry.use_temporary_ids_for_socket(websocket_id):
                if temporary_message is None:
                    temporary_content = self._convert_outgoing_to_temporary(content)
                    temporary_message = WebsocketMsgListenerRealtimeEvent(
                        content=temporary_content
                    )
                await self.websocket_manager.send_message(
                    temporary_message, websocket_id
                )
            else:
                await self.websocket_manager.send_message(message, websocket_id)

    async def send_dependency_event(
        self,
        *,
        projectConfigId: ID,
        dependencyEvents: list[DependencyEvent],
        sequence: int,
        share_session_id: str | None = None,
    ):
        if not dependencyEvents:
            raise ValueError("dependencyEvents must contain at least one entry")
        content = ListenerDependencyEventContent(
            projectConfigId=projectConfigId,
            shareSessionId=share_session_id,
            dependencyEvents=dependencyEvents,
            sequence=sequence,
        )
        logger.debug(
            "sending listener dependency event for project config %s (sequence=%s session=%s)",
            projectConfigId,
            sequence,
            share_session_id,
        )
        sockets_to_notify = set()
        for (
            registration,
            matching_callbacks,
        ) in self.listener_registry.iter_callbacks_matching_dependencies(
            project_config_id=projectConfigId,
            dependency_keys=(event.dependencyKey for event in dependencyEvents),
            event_type=DependencyEventType.ACTION,
            share_session_id=share_session_id,
        ):
            if matching_callbacks:
                sockets_to_notify.add(registration.websocket_id)

        if not sockets_to_notify:
            logger.debug(
                "no listener sockets registered for dependency events %s (project config %s)",
                [event.dependencyKey for event in dependencyEvents],
                projectConfigId,
            )
            return

        message = WebsocketMsgListenerDependencyEvent(content=content)
        temporary_message = None
        for websocket_id in sockets_to_notify:
            if self.listener_registry.use_temporary_ids_for_socket(websocket_id):
                if temporary_message is None:
                    temporary_content = self._convert_outgoing_to_temporary(content)
                    temporary_message = WebsocketMsgListenerDependencyEvent(
                        content=temporary_content
                    )
                await self.websocket_manager.send_message(
                    temporary_message, websocket_id
                )
            else:
                await self.websocket_manager.send_message(message, websocket_id)

    async def send_force_refresh(
        self,
        *,
        projectState: ProjectStateSingleConfig | None = None,
        projectConfigId: ID | None = None,
        targetWebsocketIds: Iterable[str] | None = None,
        share_session_id: str | None = None,
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
                self.listener_registry.iter_socket_ids_for_project(
                    project_config_id,
                    share_session_id=share_session_id,
                )
            )

        if not socket_ids:
            logger.debug(
                "no python script sockets recorded for force refresh (project config %s)",
                project_config_id,
            )
            if self._realtime_event_hub is not None:
                self._realtime_event_hub.reset_sequence(
                    project_config_id,
                    share_session_id=share_session_id,
                )
            return

        if self._realtime_event_hub is not None:
            self._realtime_event_hub.reset_sequence(
                project_config_id,
                share_session_id=share_session_id,
            )

        content = ListenerForceRefreshContent(
            shareSessionId=share_session_id,
            projectState=projectState,
        )
        message = WebsocketMsgListenerForceRefresh(content=content)
        temporary_message = None
        logger.debug(
            "sending listener force refresh for project config %s to %s socket(s)",
            project_config_id,
            len(socket_ids),
        )
        for websocket_id in socket_ids:
            if self.listener_registry.use_temporary_ids_for_socket(websocket_id):
                if temporary_message is None:
                    temporary_content = self._convert_outgoing_to_temporary(content)
                    temporary_message = WebsocketMsgListenerForceRefresh(
                        content=temporary_content
                    )
                await self.websocket_manager.send_message(
                    temporary_message, websocket_id
                )
            else:
                await self.websocket_manager.send_message(message, websocket_id)
