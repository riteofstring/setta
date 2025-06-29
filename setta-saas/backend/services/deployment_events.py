"""
Deployment event polling service for monitoring Fly.io machine deployment progress.
"""

import asyncio
from collections.abc import Callable

from fly.client import FlyClient


class DeploymentEventPoller:
    """Polls Fly.io for deployment events and tracks progress."""

    def __init__(self, client: FlyClient):
        self.client = client
        self.processed_events = set()

    def reset(self):
        """Reset the event tracking for a new deployment."""
        self.processed_events.clear()

    async def poll_deployment_progress(
        self,
        app_name: str,
        machine_id: str,
        broadcast_callback: Callable[[str, int], asyncio.Task],
        timeout: int = 60,
    ) -> bool:
        """Poll for deployment progress and broadcast updates.

        Args:
            app_name: Name of the Fly.io app
            machine_id: ID of the machine being deployed
            broadcast_callback: Async function to call with (message, progress)
            timeout: Maximum time to poll in seconds

        Returns:
            True if deployment completed successfully, False otherwise
        """
        start_time = asyncio.get_event_loop().time()
        last_state = None

        while asyncio.get_event_loop().time() - start_time < timeout:
            try:
                # Get machine status
                machine = await asyncio.to_thread(self.client.get_machine, app_name, machine_id)

                if not machine:
                    await asyncio.sleep(2)
                    continue

                state = machine.get("state", "unknown")

                # Broadcast state changes
                if state != last_state:
                    last_state = state

                    if state == "created":
                        await broadcast_callback("Machine created, preparing environment...", 40)
                    elif state == "starting":
                        await broadcast_callback("Starting application container...", 55)
                    elif state == "started":
                        await broadcast_callback("Container started, running health checks...", 70)
                        # Give it a moment for health checks
                        await asyncio.sleep(3)
                        await broadcast_callback("Application is running!", 85)
                        return True
                    elif state == "stopped":
                        await broadcast_callback("Machine stopped unexpectedly", 50)
                        return False
                    elif state == "destroyed":
                        await broadcast_callback("Machine was destroyed", 50)
                        return False

                # Check for any events (if available)
                events = await asyncio.to_thread(self._get_machine_events, app_name, machine_id)

                for event in events:
                    event_id = event.get("id")
                    if event_id and event_id not in self.processed_events:
                        self.processed_events.add(event_id)

                        # Process specific event types
                        event_type = event.get("type", "")
                        if "error" in event_type.lower():
                            await broadcast_callback(
                                f"Error: {event.get('message', 'Unknown error')}", 50
                            )
                            return False

            except Exception as e:
                print(f"Error polling deployment events: {e}")

            await asyncio.sleep(2)

        # Timeout reached
        return False

    def _get_machine_events(self, app_name: str, machine_id: str) -> list[dict]:
        """Get machine events from Fly.io."""
        url = f"{self.client.machines_url}/apps/{app_name}/machines/{machine_id}/events"

        try:
            import httpx

            with httpx.Client() as http:
                response = http.get(url, headers=self.client.headers, timeout=10.0)
                if response.status_code == 200:
                    return response.json()
        except Exception as e:
            print(f"Failed to get machine events: {e}")

        return []
