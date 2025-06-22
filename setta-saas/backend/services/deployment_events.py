"""
Helper service for parsing Fly.io machine events into deployment progress.
"""


class DeploymentEventParser:
    """Parses Fly.io machine events into user-friendly progress updates."""

    # Based on ACTUAL Fly.io events from testing
    EVENT_PROGRESS_MAP = {
        "launch": {
            "created": {"progress": 40, "message": "Machine created successfully"},
        },
        "start": {
            "started": {"progress": 70, "message": "Machine started successfully"},
        },
    }

    def __init__(self):
        self.seen_events = set()
        self.last_progress = 35  # Start after machine creation messages

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
        # Use the actual event ID if available
        event_id = event.get("id")
        if event_id:
            return event_id

        # Fallback to generating one
        event_type = event.get("type", "unknown")
        timestamp = event.get("timestamp", "")
        status = event.get("status", "")
        return f"{event_type}:{status}:{timestamp}"

    def _get_progress_for_event(self, event: dict) -> dict | None:
        """Get progress info for a specific event."""
        event_type = event.get("type")
        status = event.get("status")

        # Guard: Check if we have mapping for this event
        if event_type not in self.EVENT_PROGRESS_MAP:
            return None

        type_map = self.EVENT_PROGRESS_MAP[event_type]
        if status not in type_map:
            return None

        return type_map[status]

    def reset(self):
        """Reset parser state for new deployment."""
        self.seen_events.clear()
        self.last_progress = 35


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

        from fly.deployment import get_machine_events, get_machine_status

        start_time = time.time()
        deployment_complete = False
        last_state = None

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

                    # Check if we got the start event
                    if event.get("type") == "start" and event.get("status") == "started":
                        deployment_complete = True

                # Also check machine state directly
                status = await asyncio.to_thread(
                    get_machine_status, self.fly_client, app_name, machine_id
                )

                current_state = status.get("state")
                if current_state != last_state:
                    last_state = current_state

                    # Provide progress based on state
                    if current_state == "created":
                        await progress_callback("Machine is initializing...", 45)
                    elif current_state == "starting":
                        await progress_callback("Machine is starting up...", 55)
                    elif current_state == "started" and not deployment_complete:
                        await progress_callback("Machine is running!", 70)
                        deployment_complete = True

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
