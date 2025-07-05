"""
Fly.io service for managing apps and deployments.
"""

import asyncio
import base64
import os
import traceback

from config import get_settings
from deployment_script import STORAGE_DEPLOY_SCRIPT
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
from services.git_storage_service import clone_github_to_storage
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
        print(f"[PROGRESS] {percent}% - {message}")

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

        print(f"[WS] Broadcasting DEPLOYMENT_PROGRESS: {event.data}")
        print(f"[WS] Active connections: {self.ws_manager.get_connection_count()}")

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
        print(f"[FLY] Starting deployment for app: {app_name}, project: {project_id}")
        print(f"[FLY] GitHub URL: {github_url}")

        try:
            # Reset event poller for new deployment
            self.event_poller.reset()

            # Send initial progress
            await self._broadcast_deployment_progress(project_id, "Connecting to Fly.io...", 5)
            await asyncio.sleep(0.5)  # Give time for UI to update

            # Create the app
            await self._broadcast_deployment_progress(
                project_id, "Creating Fly.io application...", 10
            )

            print(f"[FLY] Creating app with org_id: {self.org_id}")
            app = await asyncio.to_thread(create_app, self.client, app_name, self.org_id)
            print(f"[FLY] ✓ App created: {app['hostname']}")

            # Allocate IP addresses
            await self._broadcast_deployment_progress(project_id, "Allocating IP addresses...", 20)
            ipv4, ipv6 = await asyncio.to_thread(allocate_ips, self.client, app_name)
            print(f"[FLY] ✓ IPv4: {ipv4}, IPv6: {ipv6}")

            # Start machine deployment (non-blocking)
            await self._broadcast_deployment_progress(
                project_id, "Starting container deployment...", 30
            )

            # Extract user_id from project_id query
            from database import Project, SessionLocal

            db = SessionLocal()
            try:
                project = db.query(Project).filter(Project.id == project_id).first()
                user_id = project.user_id if project else None
            finally:
                db.close()

            if not user_id:
                raise Exception("Could not find user_id for project")

            print(f"[FLY] User ID: {user_id}")

            # Deploy machine and poll events concurrently
            deploy_task = asyncio.create_task(
                self._deploy_machine(app_name, github_url, user_id, project_id)
            )

            # Show progress while waiting for machine creation
            machine_result = None

            if github_url:
                wait_messages = [
                    ("Cloning repository from GitHub...", 31),
                    ("Uploading files to storage...", 32),
                    ("Preparing deployment container...", 33),
                    ("Initializing container...", 34),
                ]
            else:
                wait_messages = [
                    ("Requesting new machine from Fly.io...", 31),
                    ("Allocating resources (CPU, memory)...", 32),
                    ("Setting up machine configuration...", 33),
                    ("Initializing container runtime...", 34),
                ]

            for i, (msg, progress) in enumerate(wait_messages):
                if deploy_task.done():
                    break
                await self._broadcast_deployment_progress(project_id, msg, progress)
                await asyncio.sleep(3)  # Show each message for 3 seconds

            # If still not done, show a waiting message
            while not deploy_task.done():
                await self._broadcast_deployment_progress(
                    project_id, "Waiting for Fly.io to provision machine...", 35
                )
                await asyncio.sleep(2)

            # Get machine ID from deployment
            machine_result = await deploy_task
            machine_id = machine_result["machine_id"]
            print(f"[FLY] Machine deployed: {machine_id}")

            # Now poll for detailed progress
            poll_task = asyncio.create_task(
                self._poll_and_broadcast_events(app_name, machine_id, project_id)
            )

            # Wait for polling to complete or timeout
            poll_success = await poll_task

            # Only show DNS/verification if we didn't get complete events
            if not poll_success:
                await self._broadcast_deployment_progress(
                    project_id, "Waiting for DNS propagation...", 80
                )

            is_ready = await asyncio.to_thread(wait_for_app_ready, self.client, app_name)

            if is_ready:
                await self._broadcast_deployment_progress(project_id, "Verifying deployment...", 90)
                await asyncio.sleep(0.5)
                await self._broadcast_deployment_progress(project_id, "Deployment complete!", 100)
                print("[FLY] ✓ App is ready!")
            else:
                print("[FLY] ⚠ App deployment may still be in progress")
                await self._broadcast_deployment_progress(
                    project_id, "Deployment in progress...", 85
                )

            # Return deployment info
            deployment_info = {
                "app_name": app_name,
                "hostname": app["hostname"],
                "url": f"https://{app['hostname']}",
                "machine_id": machine_id,
                "ipv4": ipv4,
                "ipv6": ipv6,
                "status": "deployed",
                "machine_state": "started",
            }

            print(f"[FLY] Deployment complete: {deployment_info}")
            return deployment_info

        except Exception as e:
            print(f"[FLY] ✗ Error during deployment: {type(e).__name__}: {str(e)}")
            print("[FLY] Full traceback:")
            traceback.print_exc()

            await self._broadcast_deployment_progress(project_id, f"Deployment failed: {str(e)}", 0)

            await asyncio.to_thread(self._cleanup_failed_app, app_name)
            raise

    async def _deploy_machine(
        self, app_name: str, github_url: str | None, user_id: str, project_id: str
    ) -> dict:
        """Deploy machine and return result."""
        print(f"[FLY] Deploying machine for app: {app_name}")

        if github_url:
            print(f"[FLY] Deploying from GitHub: {github_url}")

            # Clone to R2 storage first
            success = await asyncio.to_thread(
                clone_github_to_storage, github_url, user_id, project_id
            )

            if not success:
                raise Exception("Failed to clone repository to storage")

            # Deploy minimal container with R2 mount
            machine_id = await asyncio.to_thread(
                self._create_machine_with_storage,
                app_name,
                user_id,
                project_id,
            )
        else:
            print("[FLY] Deploying with default hello world image...")
            machine_id = await asyncio.to_thread(
                create_and_deploy_machine,
                self.client,
                app_name,
                idle_timeout_minutes=5,
            )

        print(f"[FLY] ✓ Machine created: {machine_id}")
        print("[FLY] ✓ Hibernation enabled (5 minute idle timeout)")

        return {"machine_id": machine_id}

    def _create_machine_with_storage(self, app_name: str, user_id: str, project_id: str) -> str:
        """Create a machine that syncs from R2 storage and runs user code."""
        print(f"[FLY] Creating machine with storage for app: {app_name}")

        # Get storage settings from environment
        storage_bucket = os.getenv("STORAGE_BUCKET_NAME", "user-projects")
        r2_endpoint = os.getenv("R2_ENDPOINT")
        storage_access_key = os.getenv("STORAGE_ACCESS_KEY")
        storage_secret_key = os.getenv("STORAGE_SECRET_KEY")

        # Encode the startup script
        script_base64 = base64.b64encode(STORAGE_DEPLOY_SCRIPT.encode()).decode()

        # Machine configuration using minimal Python image
        config = {
            "image": "python:3.11-slim",
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
                "PYTHONUNBUFFERED": "1",
                "USER_ID": user_id,
                "PROJECT_ID": project_id,
                # R2 credentials
                "STORAGE_BUCKET": storage_bucket,
                "R2_ENDPOINT": r2_endpoint,
                "AWS_ACCESS_KEY_ID": storage_access_key,
                "AWS_SECRET_ACCESS_KEY": storage_secret_key,
            },
            # Use init.cmd to run startup script
            "init": {
                "cmd": [
                    "/bin/bash",
                    "-c",
                    f"echo '{script_base64}' | base64 -d > /start.sh && chmod +x /start.sh && /start.sh",
                ]
            },
            "auto_destroy": False,
            "restart": {"policy": "on-failure", "max_retries": 1},
            "stop": {
                "timeout": "5m",
                "signal": "SIGTERM",
            },
        }

        # Create machine
        print("[FLY] Creating machine with config...")
        machine = self.client.create_machine(app_name, config, region="ewr")
        print(f"[FLY] Machine created with ID: {machine['id']}")
        return machine["id"]

    def _create_machine_from_github(self, app_name: str, github_url: str) -> str:
        """DEPRECATED: Use _create_machine_with_storage instead."""
        # This method is kept for backward compatibility but should not be used
        raise NotImplementedError("Use _create_machine_with_storage instead")

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
