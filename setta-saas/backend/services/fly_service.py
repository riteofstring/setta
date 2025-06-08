"""
Fly.io service for managing apps and deployments.
"""

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


class FlyService:
    """Service for managing Fly.io operations."""

    def __init__(self):
        settings = get_settings()
        self.client = FlyClient(settings.fly_api_token)
        self.org_slug = settings.fly_org_slug or "personal"
        self._org_id = None

    @property
    def org_id(self) -> str:
        """Get organization ID (cached)."""
        if not self._org_id:
            self._org_id = get_organization_id(self.client, self.org_slug)
            print(f"Using organization: {self.org_slug} (ID: {self._org_id})")
        return self._org_id

    def create_and_deploy_app(self, app_name: str) -> dict:
        """Create app, allocate IPs, and deploy a machine."""
        print(f"Creating app '{app_name}'...")

        try:
            # Create the app
            app = create_app(self.client, app_name, self.org_id)
            print(f"✓ App created: {app['hostname']}")

            # Allocate IP addresses
            print("Allocating IP addresses...")
            ipv4, ipv6 = allocate_ips(self.client, app_name)
            print(f"✓ IPv4: {ipv4}, IPv6: {ipv6}")

            # Deploy machine
            print("Deploying machine...")
            machine_id = create_and_deploy_machine(self.client, app_name)
            print(f"✓ Machine created: {machine_id}")

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
            delete_app_force(self.client, app_name)
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
