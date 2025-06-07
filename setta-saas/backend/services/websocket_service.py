"""
WebSocket service for managing connections and broadcasting events.
"""

import asyncio
import json

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
        await self.send_to_websocket(websocket, event)

    async def disconnect(self, websocket: WebSocket):
        """Remove a WebSocket connection."""
        async with self._lock:
            self.active_connections.discard(websocket)

    async def send_to_websocket(self, websocket: WebSocket, event: WebSocketEvent):
        """Send an event to a specific WebSocket connection."""
        try:
            await websocket.send_json(event.dict())
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
        tasks = [self.send_to_websocket(ws, event) for ws in connections]
        await asyncio.gather(*tasks, return_exceptions=True)

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

    def get_connection_count(self) -> int:
        """Get the number of active connections."""
        return len(self.active_connections)


# Global connection manager instance
manager = ConnectionManager()


def get_connection_manager() -> ConnectionManager:
    """Get the global connection manager instance."""
    return manager
