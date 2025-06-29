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
from services.deployment_events import DeploymentEventPoller
from services.websocket_service import get_connection_manager


class FlyService:
    """Service for managing Fly.io operations."""

    def __init__(self):
        settings = get_settings()
        self.client = FlyClient(settings.fly_api_token)
        self.org_slug = settings.fly_org_slug or "personal"
        self._org_id = None
        self.ws_manager = get_connection_manager()
        self.event_poller = DeploymentEventPoller(self.client)

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

    async def _poll_and_broadcast_events(self, app_name: str, machine_id: str, project_id: str):
        """Poll for deployment events and broadcast progress."""

        async def broadcast_callback(message: str, progress: int):
            await self._broadcast_deployment_progress(project_id, message, progress)

        # Poll for events with timeout
        success = await self.event_poller.poll_deployment_progress(
            app_name, machine_id, broadcast_callback, timeout=60
        )

        return success

    async def create_and_deploy_app_with_progress(
        self, app_name: str, project_id: str, github_url: str | None = None
    ) -> dict:
        """Create app with progress updates (async wrapper for project service)."""
        try:
            # Reset event poller for new deployment
            self.event_poller.reset()

            # Send initial progress
            await self._broadcast_deployment_progress(project_id, "Connecting to Fly.io...", 5)
            await asyncio.sleep(0.2)

            # Create the app
            await self._broadcast_deployment_progress(
                project_id, "Creating Fly.io application...", 10
            )
            app = await asyncio.to_thread(create_app, self.client, app_name, self.org_id)
            print(f"✓ App created: {app['hostname']}")

            # Allocate IP addresses
            await self._broadcast_deployment_progress(project_id, "Allocating IP addresses...", 20)
            ipv4, ipv6 = await asyncio.to_thread(allocate_ips, self.client, app_name)
            print(f"✓ IPv4: {ipv4}, IPv6: {ipv6}")

            # Start machine deployment (non-blocking)
            await self._broadcast_deployment_progress(
                project_id, "Starting container deployment...", 30
            )

            # Deploy machine and poll events concurrently
            deploy_task = asyncio.create_task(self._deploy_machine(app_name, github_url))

            # Show progress while waiting for machine creation
            if github_url:
                wait_messages = [
                    ("Cloning repository from GitHub...", 35),
                    ("Installing Python dependencies...", 40),
                    ("Building application with buildpacks...", 45),
                    ("Configuring runtime environment...", 50),
                ]
            else:
                wait_messages = [
                    ("Requesting new machine from Fly.io...", 35),
                    ("Allocating resources (CPU, memory)...", 40),
                    ("Setting up machine configuration...", 45),
                    ("Initializing container runtime...", 50),
                ]

            for i, (msg, progress) in enumerate(wait_messages):
                if deploy_task.done():
                    break
                await self._broadcast_deployment_progress(project_id, msg, progress)
                await asyncio.sleep(3)

            # Wait for deployment to complete
            machine_result = await deploy_task
            machine_id = machine_result["machine_id"]

            # Poll for deployment completion
            poll_task = asyncio.create_task(
                self._poll_and_broadcast_events(app_name, machine_id, project_id)
            )
            poll_success = await poll_task

            # Final steps
            if not poll_success:
                await self._broadcast_deployment_progress(
                    project_id, "Waiting for DNS propagation...", 80
                )

            is_ready = await asyncio.to_thread(wait_for_app_ready, self.client, app_name)

            if is_ready:
                await self._broadcast_deployment_progress(project_id, "Verifying deployment...", 90)
                await asyncio.sleep(0.5)
                await self._broadcast_deployment_progress(project_id, "Deployment complete!", 100)
                print("✓ App is ready!")
            else:
                print("⚠ App deployment may still be in progress")
                await self._broadcast_deployment_progress(
                    project_id, "Deployment in progress...", 85
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
            await asyncio.to_thread(self._cleanup_failed_app, app_name)
            raise

    async def _deploy_machine(self, app_name: str, github_url: str | None = None) -> dict:
        """Deploy machine and return result."""
        if github_url:
            print(f"Deploying from GitHub: {github_url}")
            machine_id = await asyncio.to_thread(
                self._create_machine_from_github,
                app_name,
                github_url,
            )
        else:
            print("Deploying with default hello world image...")
            machine_id = await asyncio.to_thread(
                create_and_deploy_machine,
                self.client,
                app_name,
                idle_timeout_minutes=5,
            )

        print(f"✓ Machine created: {machine_id}")
        print("✓ Hibernation enabled (5 minute idle timeout)")

        return {"machine_id": machine_id}

    def _create_machine_from_github(self, app_name: str, github_url: str) -> str:
        """Create a machine that deploys from GitHub using buildpacks."""
        # Machine configuration for buildpack deployment
        config = {
            # Use buildpacks builder image
            "image": "paketobuildpacks/builder:base",
            "guest": {"cpu_kind": "shared", "cpus": 1, "memory_mb": 512},
            "services": [
                {
                    "ports": [
                        {"port": 80, "handlers": ["http"], "force_https": True},
                        {"port": 443, "handlers": ["http", "tls"]},
                    ],
                    "protocol": "tcp",
                    "internal_port": 8080,
                    "autostop": "stop",
                    "autostart": True,
                    "min_machines_running": 0,
                }
            ],
            "env": {
                "PORT": "8080",
                "BP_GIT_URL": github_url,  # Tell buildpacks where to get the code
            },
            # Enable buildpack build
            "build": {
                "builder": "paketobuildpacks/builder:base",
                "buildpacks": ["paketo-buildpacks/python"],
                "env": {
                    "BP_GIT_URL": github_url,
                },
            },
            "auto_destroy": False,
            "restart": {"policy": "on-failure", "max_retries": 1},
            "stop": {
                "timeout": "5m",
                "signal": "SIGTERM",
            },
        }

        # Create machine with buildpack configuration
        machine = self.client.create_machine(app_name, config, region="ewr")
        return machine["id"]

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
                idle_timeout_minutes=5,
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
                "machine_state": "started",
            }

        except Exception as e:
            print(f"✗ Error during deployment: {str(e)}")
            self._cleanup_failed_app(app_name)
            raise

    def _cleanup_failed_app(self, app_name: str) -> None:
        """Clean up a failed app deployment."""
        if not app_name:
            return

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
        if not app_name:
            print("Error: Cannot delete app with empty name")
            return False

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
        if not app_name:
            return None
        return get_app_status(self.client, app_name)

    def list_all_apps(self) -> list[dict]:
        """List all apps in the organization."""
        return list_all_apps(self.client, self.org_slug)

    def delete_all_apps(self) -> dict:
        """Delete ALL apps in the organization. Nuclear option!"""
        print(f"⚠️  WARNING: This will delete ALL apps in organization '{self.org_slug}'")
        return delete_all_apps_in_org(self.client, self.org_slug)
