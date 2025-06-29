"""
WebSocket service for real-time updates.
"""

import json
from enum import Enum

from fastapi import WebSocket


class EventType(str, Enum):
    """WebSocket event types."""

    PROJECT_CREATING = "project_creating"
    PROJECT_CREATED = "project_created"
    PROJECT_UPDATED = "project_updated"
    PROJECT_DELETED = "project_deleted"
    PROJECT_DEPLOYING = "project_deploying"
    PROJECT_READY = "project_ready"
    PROJECT_ERROR = "project_error"
    PROJECT_STATUS_CHANGED = "project_status_changed"
    DEPLOYMENT_PROGRESS = "deployment_progress"
    MACHINE_STATE_CHANGED = "machine_state_changed"


class DeploymentStep(str, Enum):
    """Deployment steps for progress tracking."""

    CREATING_APP = "creating_app"
    ALLOCATING_RESOURCES = "allocating_resources"
    CONFIGURING_NETWORK = "configuring_network"
    BUILDING_APPLICATION = "building_application"
    STARTING_SERVICES = "starting_services"
    FINALIZING = "finalizing"
    COMPLETED = "completed"


class ConnectionManager:
    """Manages WebSocket connections."""

    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.user_connections: dict[str, WebSocket] = {}
        self.anonymous_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket, user_id: str = None):
        """Connect a WebSocket (with or without user ID)."""
        await websocket.accept()

        if user_id:
            self.user_connections[user_id] = websocket
            return

        self.anonymous_connections.append(websocket)

    def disconnect(self, websocket: WebSocket = None, user_id: str = None):
        """Disconnect a WebSocket."""
        # Handle user_id disconnect
        if user_id and user_id in self.user_connections:
            del self.user_connections[user_id]
            return

        # Handle websocket disconnect
        if not websocket:
            return

        # Remove from anonymous connections
        if websocket in self.anonymous_connections:
            self.anonymous_connections.remove(websocket)
            return

        # Check if it's in user connections
        for uid, ws in list(self.user_connections.items()):
            if ws != websocket:
                continue
            del self.user_connections[uid]
            break

    async def send_personal_message(self, message: dict, user_id: str):
        """Send a message to a specific user."""
        if user_id not in self.user_connections:
            return

        websocket = self.user_connections[user_id]
        try:
            await websocket.send_json(message)
        except Exception as e:
            print(f"Error sending to user {user_id}: {e}")
            self.disconnect(user_id=user_id)

    async def broadcast(self, event: dict):
        """Broadcast an event to all connected users."""
        # Convert event to JSON string once
        event_json = json.dumps(event)

        # Broadcast to authenticated users
        for user_id, websocket in list(self.user_connections.items()):
            try:
                await websocket.send_text(event_json)
            except Exception as e:
                print(f"Error broadcasting to user {user_id}: {e}")
                self.disconnect(user_id=user_id)

        # Broadcast to anonymous connections
        disconnected = []
        for websocket in self.anonymous_connections:
            try:
                await websocket.send_text(event_json)
            except Exception as e:
                print(f"Error broadcasting to anonymous connection: {e}")
                disconnected.append(websocket)

        # Remove disconnected websockets
        for ws in disconnected:
            self.disconnect(websocket=ws)

    def get_connection_count(self) -> int:
        """Get the number of active connections."""
        return len(self.user_connections) + len(self.anonymous_connections)


# Singleton instance
_connection_manager = None


def get_connection_manager() -> ConnectionManager:
    """Get the singleton ConnectionManager instance."""
    global _connection_manager
    if _connection_manager is None:
        _connection_manager = ConnectionManager()
    return _connection_manager
