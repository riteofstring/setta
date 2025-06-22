"""
Hibernation monitoring service for tracking Fly.io machine states.
"""

import asyncio
from datetime import datetime

from sqlalchemy.orm import Session

from database import Project, SessionLocal
from models.websocket import EventType, WebSocketEvent
from services.fly_service import FlyService
from services.websocket_service import get_connection_manager


class HibernationMonitor:
    """Monitor Fly.io machines for hibernation state changes."""

    def __init__(self, check_interval_seconds: int = 30):
        self.check_interval = check_interval_seconds
        self.fly = FlyService()
        self.ws_manager = get_connection_manager()
        self._running = False
        self._task = None

    async def start(self):
        """Start the hibernation monitoring loop."""
        if self._running:
            return

        self._running = True
        self._task = asyncio.create_task(self._monitor_loop())
        print(f"Hibernation monitor started (checking every {self.check_interval}s)")

    async def stop(self):
        """Stop the hibernation monitoring loop."""
        self._running = False
        if self._task:
            await self._task
        print("Hibernation monitor stopped")

    async def _monitor_loop(self):
        """Main monitoring loop."""
        while self._running:
            try:
                await self._check_all_projects()
            except Exception as e:
                print(f"Error in hibernation monitor: {e}")

            # Wait for next check
            await asyncio.sleep(self.check_interval)

    async def _check_all_projects(self):
        """Check hibernation state for all active projects."""
        db = SessionLocal()
        try:
            # Get projects that have machine IDs and aren't in error state
            projects = (
                db.query(Project)
                .filter(
                    Project.machine_id.isnot(None),
                    Project.status != "error",
                )
                .all()
            )

            if not projects:
                return

            # Check each project's machine state
            for project in projects:
                await self._check_project_machine(db, project)

        finally:
            db.close()

    async def _check_project_machine(self, db: Session, project: Project):
        """Check a single project's machine state."""
        # Skip if URL isn't valid
        if not project.url or not project.url.startswith("https://"):
            return

        try:
            # Extract app name from URL
            app_name = project.url.split("//")[1].split(".")[0]

            # Get machine status from Fly.io
            machine_info = await asyncio.to_thread(
                self.fly.client.get_machine, app_name, project.machine_id
            )

            if not machine_info:
                return

            new_state = machine_info.get("state", "unknown")
            old_state = project.machine_state

            # Update if state changed
            if new_state != old_state:
                await self._handle_state_change(db, project, old_state, new_state)

            # Update last checked time
            project.last_checked = datetime.utcnow()
            db.commit()

        except Exception as e:
            print(f"Error checking machine {project.machine_id}: {e}")

    async def _handle_state_change(
        self, db: Session, project: Project, old_state: str, new_state: str
    ):
        """Handle machine state changes and broadcast events."""
        print(f"Machine state change for {project.name}: {old_state} → {new_state}")

        # Update database
        project.machine_state = new_state

        # Map machine states to project status
        status_mapping = {
            "started": "running",
            "stopped": "hibernating",
            "stopping": "hibernating",
            "starting": "waking",
            "created": "deploying",
            "destroyed": "error",
        }

        new_status = status_mapping.get(new_state, project.status)
        if new_status != project.status:
            project.status = new_status

        db.commit()

        # Broadcast state change event
        await self._broadcast_machine_state_change(project, old_state, new_state)

    async def _broadcast_machine_state_change(
        self, project: Project, old_state: str, new_state: str
    ):
        """Broadcast machine state change via WebSocket."""
        # Create custom event data with machine state info
        event_data = {
            "project_id": project.id,
            "project_name": project.name,
            "status": project.status,
            "url": project.url,
            "machine_state": new_state,
            "previous_state": old_state,
            "timestamp": datetime.utcnow().isoformat(),
        }

        # Determine event type based on state transition
        if new_state == "stopped":
            message = f"Project {project.name} has hibernated"
        elif new_state == "starting":
            message = f"Project {project.name} is waking up"
        elif new_state == "started":
            message = f"Project {project.name} is now running"
        else:
            message = f"Project {project.name} state: {new_state}"

        # Add message to event data
        event_data["message"] = message

        # Broadcast the event
        event = WebSocketEvent(type=EventType.PROJECT_STATUS_CHANGED, data=event_data)
        await self.ws_manager.broadcast(event)

    async def wake_project(self, project_id: str) -> bool:
        """Manually wake a hibernated project."""
        db = SessionLocal()
        try:
            project = db.query(Project).filter(Project.id == project_id).first()
            if not project or not project.machine_id:
                return False

            # Check current state
            if project.machine_state not in ["stopped", "stopping"]:
                return True  # Already running or waking

            # Extract app name
            app_name = project.url.split("//")[1].split(".")[0]

            # Start the machine
            success = await asyncio.to_thread(
                self.fly.client.start_machine, app_name, project.machine_id
            )

            if success:
                # Update state immediately
                project.machine_state = "starting"
                project.status = "waking"
                db.commit()

                # Broadcast wake event
                await self._broadcast_machine_state_change(project, "stopped", "starting")

            return success

        finally:
            db.close()


# Global hibernation monitor instance
_monitor = None


def get_hibernation_monitor() -> HibernationMonitor:
    """Get or create the global hibernation monitor instance."""
    global _monitor
    if _monitor is None:
        _monitor = HibernationMonitor()
    return _monitor
