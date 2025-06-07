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
        try:
            # Step 1: Create the app
            print(f"Creating app '{app_name}'...")
            app = create_app(self.client, app_name, self.org_id)
            print(f"✓ App created: {app['hostname']}")

            # Step 2: Allocate IP addresses (CRITICAL!)
            print("Allocating IP addresses...")
            ipv4, ipv6 = allocate_ips(self.client, app_name)
            print(f"✓ IPv4: {ipv4}, IPv6: {ipv6}")

            # Step 3: Deploy a machine
            print("Deploying machine...")
            machine_id = create_and_deploy_machine(self.client, app_name)
            print(f"✓ Machine created: {machine_id}")

            # Step 4: Wait for DNS propagation
            print("Waiting for DNS propagation...")
            if wait_for_app_ready(self.client, app_name):
                print("✓ App is ready!")
            else:
                print("⚠ App deployment may still be in progress")

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
            # Try to clean up on failure
            try:
                delete_app_force(self.client, app_name)
            except Exception:
                pass
            raise

    def delete_app(self, app_name: str) -> bool:
        """Delete a Fly.io app and all its resources."""
        try:
            print(f"Force deleting app '{app_name}'...")
            # Use force delete for more reliable deletion
            success = delete_app_force(self.client, app_name)
            if success:
                print(f"✓ App '{app_name}' deleted successfully")
            return success
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
