"""
WebSocket service for managing connections and broadcasting events.
"""

import asyncio
import json
from datetime import datetime

from fastapi import WebSocket

from models.websocket import EventType, WebSocketEvent


class ConnectionManager:
    """Manages WebSocket connections and broadcasts."""

    def __init__(self):
        self.active_connections: set[WebSocket] = set()
        self._lock = asyncio.Lock()

    async def connect(self, websocket: WebSocket):
        """Accept and store a new WebSocket connection."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)

        # Send connection established event
        event = WebSocketEvent(
            type=EventType.CONNECTION_ESTABLISHED,
            data={"message": "Connected to real-time updates"},
        )

        try:
            # Send as JSON string directly
            await websocket.send_text(event.json())
            print("Sent connection message to new WebSocket client")
        except Exception as e:
            print(f"Error sending initial connection message: {e}")

    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        async with self._lock:
            self.active_connections.discard(websocket)
        print(f"WebSocket disconnected. Active connections: {len(self.active_connections)}")

    async def send_to_websocket(self, websocket: WebSocket, event: WebSocketEvent):
        """Send an event to a specific WebSocket connection."""
        try:
            # Use send_text with JSON string instead of send_json
            await websocket.send_text(event.json())
        except Exception as e:
            print(f"Error sending to websocket: {e}")
            await self.disconnect(websocket)

    async def broadcast(self, event: WebSocketEvent):
        """Broadcast an event to all connected clients."""
        if not self.active_connections:
            return

        # Create list of connections to avoid modification during iteration
        async with self._lock:
            connections = list(self.active_connections)

        # Send to all connections concurrently
        tasks = []
        for ws in connections:
            tasks.append(self.send_to_websocket(ws, event))

        await asyncio.gather(*tasks, return_exceptions=True)
        print(f"Broadcasted {event.type} to {len(connections)} clients")

    async def broadcast_json(self, data: dict):
        """Broadcast raw JSON data to all connections."""
        if not self.active_connections:
            return

        message = json.dumps(data)
        disconnected = set()

        async with self._lock:
            connections = list(self.active_connections)

        for websocket in connections:
            try:
                await websocket.send_text(message)
            except Exception:
                disconnected.add(websocket)

        # Clean up disconnected clients
        if disconnected:
            async with self._lock:
                self.active_connections -= disconnected
            print(f"Removed {len(disconnected)} disconnected clients")

    def get_connection_count(self) -> int:
        """Get the number of active connections."""
        return len(self.active_connections)

    async def send_heartbeat(self):
        """Send periodic heartbeat to all connections."""
        event = WebSocketEvent(
            type=EventType.HEARTBEAT,
            data={"timestamp": datetime.utcnow().isoformat()},
        )
        await self.broadcast(event)


# Global connection manager instance
manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    """Get the global connection manager instance."""
    return manager
