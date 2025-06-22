"""
Helper service for parsing Fly.io machine events into deployment progress.
"""


class DeploymentEventParser:
    """Parses Fly.io machine events into user-friendly progress updates."""

    # Event type to progress mapping
    EVENT_PROGRESS_MAP = {
        "start": {"base": 35, "message": "Starting machine..."},
        "image_pull": {"base": 40, "message": "Pulling Docker image..."},
        "container_create": {"base": 45, "message": "Creating container..."},
        "container_start": {"base": 50, "message": "Starting container..."},
        "health": {"base": 60, "message": "Running health checks..."},
        "network": {"base": 65, "message": "Configuring network..."},
        "ready": {"base": 70, "message": "Machine ready..."},
    }

    def __init__(self):
        self.seen_events = set()
        self.last_progress = 30  # Start after machine creation

    def parse_event(self, event: dict) -> tuple[str, int] | None:
        """
        Parse a single Fly.io event into progress update.
        Returns (message, progress_percent) or None if already seen.
        """
        # Guard: Skip if no event type
        event_type = event.get("type")
        if not event_type:
            return None

        # Guard: Skip if we've seen this event
        event_id = self._get_event_id(event)
        if event_id in self.seen_events:
            return None

        self.seen_events.add(event_id)

        # Get progress info for this event type
        progress_info = self._get_progress_for_event(event)
        if not progress_info:
            return None

        message = progress_info["message"]
        progress = progress_info["progress"]

        # Update last progress
        self.last_progress = max(self.last_progress, progress)

        return message, progress

    def _get_event_id(self, event: dict) -> str:
        """Generate unique ID for an event."""
        event_type = event.get("type", "unknown")
        timestamp = event.get("timestamp", "")
        status = event.get("status", "")
        return f"{event_type}:{status}:{timestamp}"

    def _get_progress_for_event(self, event: dict) -> dict | None:
        """Get progress info for a specific event."""
        event_type = event.get("type")

        # Guard: Unknown event type
        if event_type not in self.EVENT_PROGRESS_MAP:
            return None

        base_info = self.EVENT_PROGRESS_MAP[event_type]
        message = base_info["message"]
        base_progress = base_info["base"]

        # Customize message based on event details
        if event_type == "health":
            message = self._get_health_check_message(event)
            base_progress = self._get_health_check_progress(event)
        elif event_type == "image_pull":
            message = self._get_image_pull_message(event)

        return {"message": message, "progress": base_progress}

    def _get_health_check_message(self, event: dict) -> str:
        """Get detailed health check message."""
        status = event.get("status", "checking")
        attempt = event.get("attempt", 1)

        if status == "passing":
            return "Health checks passed!"
        elif status == "failing":
            return f"Health check failed (attempt {attempt})..."
        else:
            return f"Running health check {attempt}..."

    def _get_health_check_progress(self, event: dict) -> int:
        """Calculate health check progress."""
        attempt = event.get("attempt", 1)
        max_attempts = 3

        # Progress from 60 to 70 based on attempts
        progress_range = 10
        progress_per_attempt = progress_range // max_attempts

        return 60 + (attempt * progress_per_attempt)

    def _get_image_pull_message(self, event: dict) -> str:
        """Get detailed image pull message."""
        status = event.get("status", "pulling")
        image = event.get("image", "container image")

        if status == "complete":
            return f"Image {image} pulled successfully"
        elif status == "pulling":
            return f"Pulling {image}..."
        else:
            return "Preparing container image..."

    def reset(self):
        """Reset parser state for new deployment."""
        self.seen_events.clear()
        self.last_progress = 30


class DeploymentEventPoller:
    """Polls Fly.io for machine events during deployment."""

    def __init__(self, fly_client, poll_interval: float = 2.0):
        self.fly_client = fly_client
        self.poll_interval = poll_interval
        self.parser = DeploymentEventParser()

    async def poll_deployment_progress(
        self, app_name: str, machine_id: str, progress_callback, timeout: int = 60
    ) -> bool:
        """
        Poll for deployment events and report progress.
        Returns True if deployment completed successfully.
        """
        import asyncio
        import time

        from fly.deployment import get_machine_events

        start_time = time.time()
        deployment_complete = False

        while time.time() - start_time < timeout:
            try:
                # Get events from Fly.io
                events = await asyncio.to_thread(
                    get_machine_events, self.fly_client, app_name, machine_id
                )

                # Parse each event
                for event in events:
                    result = self.parser.parse_event(event)
                    if not result:
                        continue

                    message, progress = result
                    await progress_callback(message, progress)

                    # Check if deployment is complete
                    if event.get("type") == "ready":
                        deployment_complete = True
                        break

                if deployment_complete:
                    break

                # Wait before next poll
                await asyncio.sleep(self.poll_interval)

            except Exception as e:
                print(f"Error polling deployment events: {e}")
                # Continue polling despite errors

        return deployment_complete

    def reset(self):
        """Reset poller for new deployment."""
        self.parser.reset()
