import asyncio
import os

from fly.client import FlyClient
from fly.deployment import (
    allocate_ips,
    create_and_deploy_machine,
    create_app,
    delete_all_apps_in_org,
    delete_app_force,
    get_organization_id,
    list_all_apps,
    wait_for_app_ready,
)
from fly.deployment import (
    start_machine as fly_start_machine,
)
from fly.deployment import (
    stop_machine as fly_stop_machine,
)

from .fly_deployment_config import get_machine_config, validate_github_url
from .websocket_service import ConnectionManager


class FlyService:
    def __init__(self):
        self.api_token = os.getenv("FLY_API_TOKEN")
        if not self.api_token:
            raise ValueError("FLY_API_TOKEN environment variable is required")

        self.client = FlyClient(api_token=self.api_token)
        self.org_slug = os.getenv("FLY_ORG_SLUG", "personal")
        self.org_id = get_organization_id(self.client, self.org_slug)
        self.ws_manager = ConnectionManager()

    async def create_and_deploy_app_with_progress(
        self, app_name: str, project_id: str, github_url: str | None = None
    ) -> dict:
        """Create app with real-time progress updates via WebSocket."""
        try:
            # Initial progress
            await self._broadcast_deployment_progress(project_id, "Creating Fly.io app...", 10)

            # Create the app
            app = await asyncio.to_thread(create_app, self.client, app_name, self.org_id)
            await self._broadcast_deployment_progress(project_id, "App created successfully", 20)

            # Allocate IP addresses
            await self._broadcast_deployment_progress(project_id, "Allocating IP addresses...", 25)
            ipv4, ipv6 = await asyncio.to_thread(allocate_ips, self.client, app_name)
            await self._broadcast_deployment_progress(project_id, "IP addresses allocated", 30)

            # Deploy based on whether we have a GitHub URL
            if github_url:
                deploy_task = asyncio.create_task(self._deploy_github_machine(app_name, github_url))
                await self._broadcast_deployment_progress(
                    project_id, "Configuring GitHub deployment...", 35
                )
            else:
                deploy_task = asyncio.create_task(self._deploy_default_machine(app_name))
                await self._broadcast_deployment_progress(
                    project_id, "Deploying default container...", 35
                )

            # Wait for deployment with periodic updates
            progress = 35
            while not deploy_task.done():
                progress = min(progress + 5, 75)
                await self._broadcast_deployment_progress(
                    project_id, "Building and deploying...", progress
                )
                await asyncio.sleep(3)

            # Get machine ID from deployment
            machine_result = await deploy_task
            machine_id = machine_result["machine_id"]

            # Poll for machine status
            await self._broadcast_deployment_progress(project_id, "Verifying deployment...", 80)

            # Wait for app to be ready
            is_ready = await asyncio.to_thread(wait_for_app_ready, self.client, app_name)

            if is_ready:
                await self._broadcast_deployment_progress(project_id, "Deployment complete!", 100)
                print("✓ App is ready!")
            else:
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

    async def _deploy_default_machine(self, app_name: str) -> dict:
        """Deploy the default hello world machine."""
        machine_id = await asyncio.to_thread(
            create_and_deploy_machine,
            self.client,
            app_name,
            idle_timeout_minutes=5,
        )
        return {"machine_id": machine_id}

    async def _deploy_github_machine(self, app_name: str, github_url: str) -> dict:
        """Deploy a machine from a GitHub repository."""
        machine_id = await asyncio.to_thread(
            self._create_github_machine,
            app_name,
            github_url,
        )
        return {"machine_id": machine_id}

    def _create_github_machine(self, app_name: str, github_url: str) -> str:
        """Create a machine that builds from GitHub and runs Python code."""
        # Validate GitHub URL
        if not validate_github_url(github_url):
            raise ValueError("Only GitHub URLs are supported")

        # Get machine configuration from centralized config
        config = get_machine_config(github_url)

        # Create machine with configuration
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
            # Try to clean up on failure
            self._cleanup_failed_app(app_name)
            raise

    def _cleanup_failed_app(self, app_name: str):
        """Clean up a failed app deployment."""
        try:
            print(f"Cleaning up failed deployment for {app_name}...")
            result = delete_app_force(self.client, app_name)
            if result.get("success"):
                print("✓ Cleanup complete")
            else:
                print(f"⚠ Cleanup failed: {result.get('error')}")
        except Exception as e:
            print(f"⚠ Cleanup failed: {str(e)}")

    def destroy_app(self, app_name: str) -> bool:
        """Destroy a Fly.io app and all its resources."""
        try:
            print(f"Destroying app '{app_name}'...")
            result = delete_app_force(self.client, app_name)
            if result.get("success"):
                print(f"✓ App '{app_name}' destroyed")
                return True
            else:
                print(f"✗ Failed to destroy app: {result.get('error')}")
                return False
        except Exception as e:
            print(f"✗ Error destroying app: {str(e)}")
            raise

    def get_machine_status(self, app_name: str, machine_id: str) -> dict:
        """Get the current status of a machine."""
        try:
            machine = self.client.get_machine(app_name, machine_id)
            return {
                "state": machine.get("state", "unknown"),
                "instance_id": machine.get("instance_id"),
                "updated_at": machine.get("updated_at"),
                "region": machine.get("region"),
            }
        except Exception as e:
            print(f"Error getting machine status: {str(e)}")
            return {"state": "error", "error": str(e)}

    def start_machine(self, app_name: str, machine_id: str) -> bool:
        """Start (wake up) a stopped machine."""
        try:
            return fly_start_machine(self.client, app_name, machine_id)
        except Exception as e:
            print(f"Error starting machine: {str(e)}")
            return False

    def stop_machine(self, app_name: str, machine_id: str) -> bool:
        """Stop (hibernate) a running machine."""
        try:
            return fly_stop_machine(self.client, app_name, machine_id)
        except Exception as e:
            print(f"Error stopping machine: {str(e)}")
            return False

    async def _broadcast_deployment_progress(self, project_id: str, message: str, progress: int):
        """Broadcast deployment progress via WebSocket."""
        await self.ws_manager.broadcast_deployment_progress(project_id, message, progress)

    def list_all_apps(self) -> list[dict]:
        """List all apps in the organization."""
        return list_all_apps(self.client, self.org_slug)

    def delete_all_apps(self) -> dict:
        """Delete ALL apps in the organization. Nuclear option!"""
        return delete_all_apps_in_org(self.client, self.org_slug)

    async def _poll_and_broadcast_events(
        self, app_name: str, machine_id: str, project_id: str
    ) -> bool:
        """Poll machine events and broadcast them. Returns True if we got useful events."""
        max_polls = 30  # 30 seconds max
        got_useful_events = False

        for i in range(max_polls):
            try:
                status = await asyncio.to_thread(self.get_machine_status, app_name, machine_id)
                state = status.get("state", "unknown")

                # Map states to progress
                if state == "created":
                    await self._broadcast_deployment_progress(
                        project_id, "Machine created, preparing environment...", 40
                    )
                elif state == "starting":
                    await self._broadcast_deployment_progress(project_id, "Starting machine...", 50)
                    got_useful_events = True
                elif state == "started":
                    await self._broadcast_deployment_progress(
                        project_id, "Machine started, configuring services...", 70
                    )
                    got_useful_events = True
                    # Once started, we can stop polling
                    break

                await asyncio.sleep(1)
            except Exception as e:
                print(f"Error polling machine events: {str(e)}")
                break

        return got_useful_events
