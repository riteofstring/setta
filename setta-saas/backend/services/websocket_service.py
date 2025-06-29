"""
WebSocket service for real-time updates.
"""

import json

from fastapi import WebSocket

# Import event types and models from the models module


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
            # Convert to JSON with datetime handling
            await websocket.send_text(json.dumps(message, default=str))
        except Exception as e:
            print(f"Error sending to user {user_id}: {e}")
            self.disconnect(user_id=user_id)

    async def broadcast(self, event: dict):
        """Broadcast an event to all connected users."""
        # Convert event to JSON string once
        # Handle datetime serialization by converting to ISO format
        event_json = json.dumps(event, default=str)

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
