from enum import Enum

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect


class EventType(str, Enum):
    PROJECT_CREATED = "project_created"
    PROJECT_UPDATED = "project_updated"
    PROJECT_DELETED = "project_deleted"
    PROJECT_DEPLOYING = "project_deploying"
    PROJECT_READY = "project_ready"
    PROJECT_ERROR = "project_error"
    DEPLOYMENT_PROGRESS = "deployment_progress"
    MACHINE_STATE_CHANGED = "machine_state_changed"


class DeploymentStep(str, Enum):
    CREATING_APP = "Creating Fly.io app..."
    APP_CREATED = "App created successfully"
    ALLOCATING_IPS = "Allocating IP addresses..."
    IPS_ALLOCATED = "IP addresses allocated"

    # Default deployment steps
    DEPLOYING_DEFAULT = "Deploying default container..."

    # GitHub deployment steps
    VALIDATING_GITHUB = "Validating GitHub repository..."
    CLONING_REPO = "Cloning repository from GitHub..."
    DETECTING_BUILDPACK = "Detecting Python application..."
    INSTALLING_DEPS = "Installing dependencies from requirements.txt..."
    BUILDING_IMAGE = "Building container image..."
    DEPLOYING_GITHUB = "Building from GitHub repository..."

    # Common final steps
    WAITING_DEPLOYMENT = "Waiting for deployment to complete..."
    VERIFYING = "Verifying deployment..."
    COMPLETE = "Deployment complete!"


class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}
        self.user_connections: dict[str, WebSocket] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        """Connect a user's WebSocket."""
        await websocket.accept()
        self.user_connections[user_id] = websocket

    def disconnect(self, user_id: str):
        """Disconnect a user's WebSocket."""
        if user_id in self.user_connections:
            del self.user_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: str):
        """Send a message to a specific user."""
        if user_id not in self.user_connections:
            return

        websocket = self.user_connections[user_id]
        try:
            await websocket.send_json(message)
        except Exception as e:
            print(f"Error sending to user {user_id}: {e}")
            self.disconnect(user_id)

    async def broadcast_project_event(
        self, project: dict, event_type: EventType, message: str = ""
    ):
        """Broadcast a project event to the project owner."""
        user_id = project.get("user_id")
        if not user_id:
            return

        await self.send_personal_message(
            {
                "type": event_type.value,
                "project": project,
                "message": message,
            },
            user_id,
        )

    async def broadcast_deployment_progress(self, project_id: str, step: str, progress: int):
        """Broadcast deployment progress updates."""
        # For now, broadcast to all connected users
        # In production, you'd want to filter by project access
        for user_id, websocket in self.user_connections.items():
            try:
                await websocket.send_json(
                    {
                        "type": EventType.DEPLOYMENT_PROGRESS.value,
                        "project_id": project_id,
                        "step": step,
                        "progress": progress,
                    }
                )
            except Exception as e:
                print(f"Error broadcasting to user {user_id}: {e}")

    async def handle_websocket(self, websocket: WebSocket, user_id: str):
        """Handle WebSocket connection lifecycle."""
        await self.connect(user_id, websocket)
        try:
            while True:
                # Keep connection alive and handle any incoming messages
                data = await websocket.receive_text()
                # Handle ping/pong or other messages if needed
                if data == "ping":
                    await websocket.send_text("pong")
        except WebSocketDisconnect:
            self.disconnect(user_id)
        except Exception as e:
            print(f"WebSocket error for user {user_id}: {e}")
            self.disconnect(user_id)
