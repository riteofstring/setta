"""
Fly.io service for managing applications and deployments.
"""

import asyncio
import os

from fly.client import FlyClient
from fly.deployment import (
    allocate_ips,
    create_and_deploy_machine,
    create_app,
    delete_all_apps_in_org,
    get_app_status,
    get_machine_status,
    list_all_apps,
    start_machine,
    stop_machine,
    wait_for_app_ready,
)
from fly.queries import GET_APP, GET_LATEST_DEPLOYMENT
from models.fly import FlyAppInfo, FlyDeploymentStatus, FlyMachineInfo
from services.deployment_events import DeploymentEventPoller


class FlyService:
    """Service for managing Fly.io resources."""

    def __init__(self):
        self.client = FlyClient(os.getenv("FLY_API_TOKEN"))
        self.org_slug = os.getenv("FLY_ORG_SLUG", "personal")
        self.org_id = os.getenv("FLY_ORG_ID")
        self.event_poller = DeploymentEventPoller(self.client)

    async def _broadcast_deployment_progress(self, project_id: str, message: str, progress: int):
        """Helper to broadcast deployment progress via websocket."""
        from models.websocket import ProgressData, WebSocketEvent
        from services.websocket_service import get_connection_manager

        ws_manager = get_connection_manager()
        event_data = ProgressData(
            project_id=project_id,
            message=message,
            progress=progress,
            step=message,
        )
        event = WebSocketEvent(type="progress", data=event_data)
        await ws_manager.broadcast(event)

    def _get_buildpack_config(self, github_url: str) -> dict:
        """Get the build configuration for GitHub repositories."""
        return {
            "builtin": "paketo",  # Use Paketo buildpacks which support Python
            "repo": github_url,  # GitHub repository URL
        }

    def _get_machine_guest_config(self) -> dict:
        """Get the guest configuration for machines."""
        return {"cpu_kind": "shared", "cpus": 1, "memory_mb": 512}

    def _get_machine_services_config(self) -> list:
        """Get the services configuration for machines."""
        return [
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
        ]

    def _get_machine_env_config(self) -> dict:
        """Get the environment configuration for machines."""
        return {
            "PORT": "8080",
            "PYTHONUNBUFFERED": "1",
        }

    def _get_machine_base_config(self) -> dict:
        """Get the base configuration for machines."""
        return {
            "guest": self._get_machine_guest_config(),
            "services": self._get_machine_services_config(),
            "env": self._get_machine_env_config(),
            "auto_destroy": False,
            "restart": {"policy": "on-failure", "max_retries": 1},
            "stop": {"timeout": "5m", "signal": "SIGTERM"},
        }

    def _create_machine_from_github(self, app_name: str, github_url: str) -> str:
        """Create a machine that builds and runs from a GitHub repository using buildpacks."""
        config = self._get_machine_base_config()
        config["build"] = self._get_buildpack_config(github_url)

        machine = self.client.create_machine(app_name, config, region="ewr")
        return machine["id"]

    async def _deploy_machine(self, app_name: str, github_url: str | None = None) -> dict:
        """Deploy machine with appropriate configuration."""
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

    async def _create_fly_app(self, app_name: str, project_id: str) -> dict:
        """Create a Fly.io application."""
        await self._broadcast_deployment_progress(project_id, "Creating Fly.io application...", 10)
        app = await asyncio.to_thread(create_app, self.client, app_name, self.org_id)
        print(f"✓ App created: {app['hostname']}")
        return app

    async def _allocate_app_ips(self, app_name: str, project_id: str) -> tuple:
        """Allocate IP addresses for the app."""
        await self._broadcast_deployment_progress(project_id, "Allocating IP addresses...", 20)
        ipv4, ipv6 = await asyncio.to_thread(allocate_ips, self.client, app_name)
        print(f"✓ IPv4: {ipv4}, IPv6: {ipv6}")
        return ipv4, ipv6

    def _get_deployment_wait_messages(self, github_url: str | None) -> list:
        """Get progress messages based on deployment type."""
        if github_url:
            return [
                ("Cloning repository from GitHub...", 31),
                ("Detecting Python application...", 32),
                ("Building with Paketo buildpacks...", 33),
                ("Installing Python dependencies...", 34),
            ]

        return [
            ("Requesting new machine from Fly.io...", 31),
            ("Allocating resources (CPU, memory)...", 32),
            ("Setting up machine configuration...", 33),
            ("Initializing container runtime...", 34),
        ]

    async def _show_deployment_progress(
        self, deploy_task: asyncio.Task, project_id: str, github_url: str | None
    ) -> None:
        """Show progress messages while waiting for deployment."""
        wait_messages = self._get_deployment_wait_messages(github_url)

        for msg, progress in wait_messages:
            if deploy_task.done():
                break
            await self._broadcast_deployment_progress(project_id, msg, progress)
            await asyncio.sleep(3)

        # If still not done, show waiting message
        while not deploy_task.done():
            await self._broadcast_deployment_progress(
                project_id, "Waiting for machine creation...", 35
            )
            await asyncio.sleep(2)

    async def _wait_for_deployment_completion(
        self, app_name: str, machine_id: str, project_id: str
    ) -> bool:
        """Poll for deployment completion."""
        await self._broadcast_deployment_progress(
            project_id, "Machine created. Starting deployment...", 40
        )

        poll_task = asyncio.create_task(
            self.poll_deployment_events(app_name, machine_id, project_id)
        )

        try:
            return await asyncio.wait_for(poll_task, timeout=120)
        except TimeoutError:
            await self._broadcast_deployment_progress(
                project_id, "Deployment taking longer than expected...", 95
            )
            return False

    async def _broadcast_final_status(self, project_id: str, success: bool) -> None:
        """Broadcast the final deployment status."""
        if success:
            await self._broadcast_deployment_progress(
                project_id, "Deployment complete! Your app is ready.", 100
            )
        else:
            await self._broadcast_deployment_progress(
                project_id,
                "Deployment may need more time. Check status in a moment.",
                100,
            )

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
                print("⚠ App may need more time to fully deploy")

            # Get the app URL
            url = f"https://{app_name}.fly.dev"

            return {
                "app_name": app_name,
                "machine_id": machine_id,
                "url": url,
                "status": "running",
            }

        except Exception as e:
            print(f"Error creating app: {e}")
            raise

    async def poll_deployment_events(self, app_name: str, machine_id: str, project_id: str) -> bool:
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
            app = await self._create_fly_app(app_name, project_id)

            # Allocate IP addresses
            ipv4, ipv6 = await self._allocate_app_ips(app_name, project_id)

            # Start machine deployment
            await self._broadcast_deployment_progress(
                project_id, "Starting container deployment...", 30
            )

            deploy_task = asyncio.create_task(self._deploy_machine(app_name, github_url))

            # Show progress while waiting
            await self._show_deployment_progress(deploy_task, project_id, github_url)

            # Get machine result
            machine_result = await deploy_task
            machine_id = machine_result["machine_id"]

            # Wait for deployment to complete
            deployment_success = await self._wait_for_deployment_completion(
                app_name, machine_id, project_id
            )

            # Broadcast final status
            await self._broadcast_final_status(project_id, deployment_success)

            # Return deployment info
            url = f"https://{app_name}.fly.dev"
            return {
                "app_name": app_name,
                "machine_id": machine_id,
                "url": url,
                "status": "running",
            }

        except Exception as e:
            await self._broadcast_deployment_progress(
                project_id, f"Deployment failed: {str(e)}", 100
            )
            raise

    def _extract_machines_from_app(self, app_data: dict) -> list[FlyMachineInfo]:
        """Extract machine information from app data."""
        machines = []
        for node in app_data.get("machines", {}).get("nodes", []):
            machine = FlyMachineInfo(
                id=node["id"],
                state=node["state"],
                region=node["region"],
                created_at=node["createdAt"],
                updated_at=node["updatedAt"],
                instance_id=node.get("instanceId"),
                private_ip=node.get("privateIP"),
            )
            machines.append(machine)
        return machines

    def _destroy_app_machines(self, app_name: str, machines: list) -> None:
        """Destroy all machines for an app."""
        for machine in machines:
            machine_id = machine["id"]
            print(f"Destroying machine {machine_id}...")
            try:
                self.client.delete_machine(app_name, machine_id)
            except Exception as e:
                print(f"Error destroying machine {machine_id}: {e}")

    def destroy_app(self, app_name: str) -> bool:
        """Destroy a Fly.io app."""
        try:
            print(f"Destroying app {app_name}...")

            # Get app details to find machines
            app_query = self.client.execute_query(GET_APP, {"name": app_name})
            if not app_query or "app" not in app_query:
                print(f"App {app_name} not found")
                return False

            app = app_query["app"]
            machines = app.get("machines", {}).get("nodes", [])

            # Destroy all machines first
            self._destroy_app_machines(app_name, machines)

            # Delete the app itself
            print(f"Deleting app {app_name}...")
            self.client.delete_app(app_name)

            print(f"✓ App {app_name} destroyed")
            return True

        except Exception as e:
            print(f"Error destroying app: {e}")
            raise

    def delete_app(self, app_name: str) -> bool:
        """Alias for destroy_app for compatibility."""
        return self.destroy_app(app_name)

    def get_app_info(self, app_name: str) -> FlyAppInfo | None:
        """Get detailed information about a Fly.io app."""
        try:
            result = self.client.execute_query(GET_APP, {"name": app_name})

            if not result or "app" not in result:
                return None

            app_data = result["app"]
            machines = self._extract_machines_from_app(app_data)

            # Create app info
            app_info = FlyAppInfo(
                id=app_data["id"],
                name=app_data["name"],
                hostname=app_data["hostname"],
                deployed=app_data.get("deployed", False),
                status=app_data.get("status", "unknown"),
                created_at=app_data.get("createdAt"),
                machines=machines,
            )

            return app_info

        except Exception as e:
            print(f"Error getting app info: {e}")
            return None

    def get_deployment_status(self, app_name: str) -> FlyDeploymentStatus | None:
        """Get the latest deployment status for an app."""
        try:
            result = self.client.execute_query(GET_LATEST_DEPLOYMENT, {"appName": app_name})

            if not result or "app" not in result:
                return None

            nodes = result.get("app", {}).get("deployments", {}).get("nodes", [])
            if not nodes:
                return None

            # Get the latest deployment (first in list)
            deployment = nodes[0]

            return FlyDeploymentStatus(
                id=deployment["id"],
                status=deployment["status"],
                successful=deployment.get("successful", False),
                created_at=deployment.get("createdAt"),
                updated_at=deployment.get("updatedAt"),
                description=deployment.get("description"),
            )

        except Exception as e:
            print(f"Error getting deployment status: {e}")
            return None

    async def get_machine_state(self, app_name: str, machine_id: str) -> str | None:
        """Get the current state of a machine."""
        status = await asyncio.to_thread(get_machine_status, self.client, app_name, machine_id)
        return status.get("state") if status else None

    async def start_app_machine(self, app_name: str, machine_id: str) -> bool:
        """Start a stopped machine."""
        return await asyncio.to_thread(start_machine, self.client, app_name, machine_id)

    async def stop_app_machine(self, app_name: str, machine_id: str) -> bool:
        """Stop a running machine."""
        return await asyncio.to_thread(stop_machine, self.client, app_name, machine_id)

    def get_app_status(self, app_name: str) -> dict | None:
        """Get app status (sync method for compatibility)."""
        return get_app_status(self.client, app_name)

    def list_all_apps(self) -> list[dict]:
        """List all apps in the organization."""
        return list_all_apps(self.client, self.org_slug)

    def delete_all_apps(self) -> dict:
        """Delete ALL apps in the organization. Nuclear option!"""
        print(f"⚠️  WARNING: This will delete ALL apps in organization '{self.org_slug}'")
        return delete_all_apps_in_org(self.client, self.org_slug)
