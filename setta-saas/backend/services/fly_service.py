"""
Fly.io service for managing apps.
"""

import asyncio
from datetime import UTC, datetime

from fly import FlyClient
from fly.deployment import allocate_ips, create_and_deploy_machine, create_app, wait_for_app_ready
from fly.queries import get_organization_id
from models.websocket import DeploymentData, EventType, WebSocketEvent
from services.websocket_service import get_connection_manager

from .event_poller import EventPoller


class FlyService:
    """Service for interacting with Fly.io API."""

    def __init__(self):
        self.client = FlyClient()
        self.org_id = get_organization_id(self.client)
        self.event_poller = EventPoller()
        self.ws_manager = get_connection_manager()

    async def _broadcast_deployment_progress(self, project_id: str, message: str, progress: int):
        """Broadcast deployment progress to WebSocket clients."""
        event = WebSocketEvent(
            type=EventType.DEPLOYMENT_PROGRESS,
            data=DeploymentData(
                project_id=project_id,
                message=message,
                progress=progress,
                timestamp=datetime.now(UTC).isoformat(),
            ),
        )
        await self.ws_manager.broadcast(event.model_dump())

    async def _create_app_with_ips(self, app_name: str, project_id: str) -> dict:
        """Create app and allocate IPs."""
        await self._broadcast_deployment_progress(project_id, "Creating Fly.io application...", 10)
        app = await asyncio.to_thread(create_app, self.client, app_name, self.org_id)
        print(f"✓ App created: {app['hostname']}")

        await self._broadcast_deployment_progress(project_id, "Allocating IP addresses...", 20)
        ipv4, ipv6 = await asyncio.to_thread(allocate_ips, self.client, app_name)
        print(f"✓ IPv4: {ipv4}, IPv6: {ipv6}")

        return app

    async def _show_deployment_progress(
        self, deploy_task: asyncio.Task, project_id: str, github_url: str | None
    ) -> dict:
        """Show progress messages while deployment runs."""
        messages = self._get_progress_messages(github_url)

        for msg, progress in messages:
            if deploy_task.done():
                return await deploy_task
            await self._broadcast_deployment_progress(project_id, msg, progress)
            await asyncio.sleep(3)

        # Wait for deployment to complete
        while not deploy_task.done():
            await self._broadcast_deployment_progress(
                project_id, "Waiting for machine to be created...", 35
            )
            try:
                return await asyncio.wait_for(deploy_task, timeout=5)
            except TimeoutError:
                continue

    def _get_progress_messages(self, github_url: str | None) -> list[tuple[str, int]]:
        """Get progress messages based on deployment type."""
        if github_url:
            return [
                ("Cloning repository from GitHub...", 31),
                ("Detecting Python application...", 32),
                ("Installing dependencies...", 33),
                ("Building container image...", 34),
            ]
        return [
            ("Requesting new machine from Fly.io...", 31),
            ("Allocating resources (CPU, memory)...", 32),
            ("Setting up machine configuration...", 33),
            ("Initializing container runtime...", 34),
        ]

    async def _wait_for_app_ready(self, app_name: str, project_id: str):
        """Wait for app to be ready and send final progress."""
        await self._broadcast_deployment_progress(project_id, "Waiting for DNS propagation...", 95)

        is_ready = await asyncio.to_thread(wait_for_app_ready, self.client, app_name)

        if not is_ready:
            print("⚠️  App may need more time to be fully ready")
            await self._broadcast_deployment_progress(
                project_id, "App deployed, but may need more time to be ready.", 100
            )
            return

        await self._broadcast_deployment_progress(
            project_id, "Deployment complete! Your project is ready.", 100
        )
        print("✓ App is ready!")

    async def _poll_events(self, app_name: str, machine_id: str, project_id: str) -> bool:
        """Poll for deployment events and update progress."""

        async def broadcast_callback(message: str, progress: int):
            await self._broadcast_deployment_progress(project_id, message, progress)

        success = await self.event_poller.poll_deployment_progress(
            app_name, machine_id, broadcast_callback, timeout=60
        )
        return success

    async def create_and_deploy_app_with_progress(
        self, app_name: str, project_id: str, github_url: str | None = None
    ) -> dict:
        """Create app with progress updates."""
        try:
            self.event_poller.reset()

            # Initial connection
            await self._broadcast_deployment_progress(project_id, "Connecting to Fly.io...", 5)
            await asyncio.sleep(0.2)

            # Create app and allocate IPs
            app = await self._create_app_with_ips(app_name, project_id)

            # Start deployment
            await self._broadcast_deployment_progress(
                project_id, "Starting container deployment...", 30
            )

            deploy_task = asyncio.create_task(self._deploy_machine(app_name, github_url))
            machine_result = await self._show_deployment_progress(
                deploy_task, project_id, github_url
            )
            machine_id = machine_result["machine_id"]

            # Poll for events
            poll_task = asyncio.create_task(self._poll_events(app_name, machine_id, project_id))

            try:
                success = await asyncio.wait_for(poll_task, timeout=120)
            except TimeoutError:
                print("⚠️  Event polling timed out, but deployment may still succeed")
                success = False

            # Show final progress if no events
            if not success:
                await self._broadcast_deployment_progress(
                    project_id, "Finalizing deployment...", 90
                )
                await asyncio.sleep(2)

            # Wait for app to be ready
            await self._wait_for_app_ready(app_name, project_id)

            return {
                "url": f"https://{app_name}.fly.dev",
                "app_name": app_name,
                "machine_id": machine_id,
                "hostname": app["hostname"],
            }

        except Exception as e:
            print(f"✗ Deployment failed: {str(e)}")
            await self._broadcast_deployment_progress(
                project_id, f"Deployment failed: {str(e)}", -1
            )
            raise

    async def _deploy_machine(self, app_name: str, github_url: str | None = None) -> dict:
        """Deploy a machine with optional GitHub source."""
        if not github_url:
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

        print(f"Deploying from GitHub: {github_url}")
        machine_id = await asyncio.to_thread(
            self._create_machine_from_github,
            app_name,
            github_url,
        )
        print(f"✓ Machine created: {machine_id}")
        print("✓ Hibernation enabled (5 minute idle timeout)")
        return {"machine_id": machine_id}

    def _create_machine_from_github(self, app_name: str, github_url: str) -> str:
        """Create a machine that clones and runs a GitHub repository."""
        repo_name = github_url.split("/")[-1].replace(".git", "")

        startup_commands = [
            "apt-get update && apt-get install -y git",
            f"git clone {github_url} /app",
            "cd /app",
            "pip install --no-cache-dir -r requirements.txt || echo 'No requirements.txt found'",
            # Auto-detect how to run the app
            "if [ -f app.py ]; then uvicorn app:app --host 0.0.0.0 --port 8080; "
            "elif [ -f main.py ]; then uvicorn main:app --host 0.0.0.0 --port 8080; "
            "else python -m http.server 8080; fi",
        ]

        startup_script = " && ".join(startup_commands)

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
                "GIT_REPO": github_url,
                "REPO_NAME": repo_name,
            },
            "init": {"cmd": ["/bin/sh", "-c", startup_script]},
            "auto_destroy": False,
            "restart": {"policy": "on-failure", "max_retries": 1},
            "stop": {
                "timeout": "5m",
                "signal": "SIGTERM",
            },
        }

        machine = self.client.create_machine(app_name, config, region="ewr")
        return machine["id"]

    def create_and_deploy_app(self, app_name: str) -> dict:
        """Create app, allocate IPs, and deploy a machine (sync version)."""
        print(f"Creating app '{app_name}'...")

        try:
            app = create_app(self.client, app_name, self.org_id)
            print(f"✓ App created: {app['hostname']}")

            print("Allocating IP addresses...")
            ipv4, ipv6 = allocate_ips(self.client, app_name)
            print(f"✓ IPv4: {ipv4}, IPv6: {ipv6}")

            print("Deploying machine with hibernation enabled...")
            machine_id = create_and_deploy_machine(
                self.client,
                app_name,
                idle_timeout_minutes=5,
            )
            print(f"✓ Machine created: {machine_id}")
            print("✓ Hibernation enabled (5 minute idle timeout)")

            print("Waiting for DNS propagation...")
            is_ready = wait_for_app_ready(self.client, app_name)

            if not is_ready:
                print("⚠️  App may need more time to be fully ready")

            return {
                "url": f"https://{app_name}.fly.dev",
                "app_name": app_name,
                "machine_id": machine_id,
                "hostname": app["hostname"],
            }

        except Exception as e:
            print(f"✗ Failed to create app: {str(e)}")
            raise

    def destroy_app(self, app_name: str) -> bool:
        """Destroy a Fly.io app."""
        try:
            result = self.client.delete_app(app_name)
            print(f"✓ App '{app_name}' destroyed")
            return result
        except Exception as e:
            print(f"✗ Failed to destroy app: {str(e)}")
            raise
