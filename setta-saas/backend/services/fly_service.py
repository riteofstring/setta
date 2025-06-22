"""
Fly.io service for managing apps and deployments.
"""

import asyncio

from config import get_settings
from fly.client import FlyClient
from fly.deployment import (
    allocate_ips,
    create_and_deploy_machine,
    create_app,
    delete_all_apps_in_org,
    delete_app_force,
    get_app_status,
    get_organization_id,
    list_all_apps,
    wait_for_app_ready,
)
from models.websocket import EventType, ProgressData, WebSocketEvent
from services.websocket_service import get_connection_manager


class FlyService:
    """Service for managing Fly.io operations."""

    def __init__(self):
        settings = get_settings()
        self.client = FlyClient(settings.fly_api_token)
        self.org_slug = settings.fly_org_slug or "personal"
        self._org_id = None
        self.ws_manager = get_connection_manager()

    @property
    def org_id(self) -> str:
        """Get organization ID (cached)."""
        if not self._org_id:
            self._org_id = get_organization_id(self.client, self.org_slug)
            print(f"Using organization: {self.org_slug} (ID: {self._org_id})")
        return self._org_id

    async def _broadcast_deployment_progress(self, project_id: str, message: str, percent: int):
        """Broadcast deployment progress."""
        progress_data = ProgressData(
            current_step=percent // 20,
            total_steps=5,
            message=message,
            percent_complete=percent,
        )

        event = WebSocketEvent(
            type=EventType.DEPLOYMENT_PROGRESS,
            data={
                "project_id": project_id,
                "progress": progress_data.dict(),
            },
        )
        await self.ws_manager.broadcast(event)

    async def create_and_deploy_app_with_progress(self, app_name: str, project_id: str) -> dict:
        """Create app with progress updates (async wrapper for project service)."""
        try:
            # Send initial progress
            await self._broadcast_deployment_progress(project_id, "Starting deployment...", 10)

            # Create the app
            print(f"Creating app '{app_name}'...")
            await self._broadcast_deployment_progress(
                project_id, "Creating Fly.io application...", 20
            )

            app = await asyncio.to_thread(create_app, self.client, app_name, self.org_id)
            print(f"✓ App created: {app['hostname']}")

            # Allocate IP addresses
            await self._broadcast_deployment_progress(project_id, "Allocating IP addresses...", 40)

            print("Allocating IP addresses...")
            ipv4, ipv6 = await asyncio.to_thread(allocate_ips, self.client, app_name)
            print(f"✓ IPv4: {ipv4}, IPv6: {ipv6}")

            # Deploy machine
            await self._broadcast_deployment_progress(
                project_id, "Deploying container to Fly.io...", 60
            )

            print("Deploying machine with hibernation enabled...")
            machine_id = await asyncio.to_thread(
                create_and_deploy_machine,
                self.client,
                app_name,
                idle_timeout_minutes=5,
            )
            print(f"✓ Machine created: {machine_id}")
            print("✓ Hibernation enabled (5 minute idle timeout)")

            # Wait for app to be ready
            await self._broadcast_deployment_progress(
                project_id, "Waiting for container to start...", 80
            )

            print("Waiting for DNS propagation...")
            is_ready = await asyncio.to_thread(wait_for_app_ready, self.client, app_name)

            if is_ready:
                print("✓ App is ready!")
                await self._broadcast_deployment_progress(
                    project_id, "Finalizing deployment...", 95
                )
                # Small delay so user sees the progress
                await asyncio.sleep(0.5)
                await self._broadcast_deployment_progress(project_id, "Deployment complete!", 100)
            else:
                print("⚠ App deployment may still be in progress")
                await self._broadcast_deployment_progress(
                    project_id, "Deployment in progress...", 90
                )

            # Return deployment info
            return {
                "app_name": app_name,
                "hostname": app["hostname"],
                "url": f"https://{app['hostname']}",
                "machine_id": machine_id,
                "ipv4": ipv4,
                "ipv6": ipv6,
                "status": "deployed",
                "machine_state": "started",
            }

        except Exception as e:
            print(f"✗ Error during deployment: {str(e)}")
            # Try to clean up if deployment failed
            await asyncio.to_thread(self._cleanup_failed_app, app_name)
            raise

    def create_and_deploy_app(self, app_name: str) -> dict:
        """Create app, allocate IPs, and deploy a machine (sync version for compatibility)."""
        print(f"Creating app '{app_name}'...")

        try:
            # Create the app
            app = create_app(self.client, app_name, self.org_id)
            print(f"✓ App created: {app['hostname']}")

            # Allocate IP addresses
            print("Allocating IP addresses...")
            ipv4, ipv6 = allocate_ips(self.client, app_name)
            print(f"✓ IPv4: {ipv4}, IPv6: {ipv6}")

            # Deploy machine with 5 minute idle timeout for cost savings
            print("Deploying machine with hibernation enabled...")
            machine_id = create_and_deploy_machine(
                self.client,
                app_name,
                idle_timeout_minutes=5,  # Hibernate after 5 minutes of inactivity
            )
            print(f"✓ Machine created: {machine_id}")
            print("✓ Hibernation enabled (5 minute idle timeout)")

            # Wait for app to be ready
            print("Waiting for DNS propagation...")
            is_ready = wait_for_app_ready(self.client, app_name)
            if is_ready:
                print("✓ App is ready!")
            else:
                print("⚠ App deployment may still be in progress")

            # Return deployment info
            return {
                "app_name": app_name,
                "hostname": app["hostname"],
                "url": f"https://{app['hostname']}",
                "machine_id": machine_id,
                "ipv4": ipv4,
                "ipv6": ipv6,
                "status": "deployed",
                "machine_state": "started",  # Initial state
            }

        except Exception as e:
            print(f"✗ Error during deployment: {str(e)}")
            # Try to clean up if deployment failed
            self._cleanup_failed_app(app_name)
            raise

    def _cleanup_failed_app(self, app_name: str) -> None:
        """Clean up a failed app deployment."""
        try:
            print(f"Cleaning up failed app: {app_name}")
            result = delete_app_force(self.client, app_name)
            if result.get("success"):
                print(f"✓ Cleanup successful for {app_name}")
            else:
                print(f"✗ Cleanup failed for {app_name}: {result.get('error')}")
        except Exception as e:
            print(f"Failed to cleanup app: {e}")

    def delete_app(self, app_name: str) -> bool:
        """Delete a Fly.io app and all its resources."""
        print(f"Force deleting app '{app_name}'...")

        try:
            result = delete_app_force(self.client, app_name)

            if result.get("success"):
                print(f"✓ App '{app_name}' deleted successfully")
                return True
            else:
                print(
                    f"✗ Failed to delete '{app_name}': {result.get('status_code')} - {result.get('error')}"
                )
                return False

        except Exception as e:
            print(f"✗ Error deleting app: {str(e)}")
            raise

    def get_app_status(self, app_name: str) -> dict | None:
        """Get current status of a Fly.io app."""
        return get_app_status(self.client, app_name)

    def list_all_apps(self) -> list[dict]:
        """List all apps in the organization."""
        return list_all_apps(self.client, self.org_slug)

    def delete_all_apps(self) -> dict:
        """Delete ALL apps in the organization. Nuclear option!"""
        print(f"⚠️  WARNING: This will delete ALL apps in organization '{self.org_slug}'")
        return delete_all_apps_in_org(self.client, self.org_slug)
