"""
High-level Fly.io operations service.
Provides a clean interface for app management.
"""

from ..fly.client import FlyAPIError, FlyClient
from ..fly.deployment import FlyDeployment
from ..fly.queries import (
    CREATE_APP_MUTATION,
    DELETE_APP_MUTATION,
    GET_APP_STATUS_QUERY,
    GET_ORGANIZATIONS_QUERY,
)


class FlyService:
    """High-level service for Fly.io operations."""

    def __init__(self):
        self.client = FlyClient()
        self.deployment = FlyDeployment(self.client)
        self._org_id: str | None = None

    @property
    def organization_id(self) -> str:
        """Get organization ID (cached after first call)."""
        if not self._org_id:
            self._org_id = self._get_organization_id()
        return self._org_id

    def _get_organization_id(self) -> str:
        """Get the user's personal organization ID."""
        data = self.client.graphql(GET_ORGANIZATIONS_QUERY)
        orgs = data.get("viewer", {}).get("organizations", {}).get("nodes", [])

        if not orgs:
            raise FlyAPIError("No organizations found")

        # Find personal organization
        for org in orgs:
            if org["type"] == "PERSONAL":
                print(f"Using personal org: {org['name']} (ID: {org['id']})")
                return org["id"]

        # Fallback to first org
        first_org = orgs[0]
        print(f"Using first org: {first_org['name']} (ID: {first_org['id']})")
        return first_org["id"]

    def create_app(self, app_name: str) -> dict:
        """Create a new Fly.io app."""
        print(f"Creating app '{app_name}'...")

        variables = {"input": {"name": app_name, "organizationId": self.organization_id}}

        data = self.client.graphql(CREATE_APP_MUTATION, variables)

        if not data.get("createApp"):
            raise FlyAPIError("Failed to create app")

        app = data["createApp"]["app"]
        print(f"✓ App created: {app['hostname']}")
        return app

    def deploy_image(self, app_id: str, image: str = "flyio/hellofly:latest") -> dict:
        """Deploy a Docker image to an app."""
        return self.deployment.deploy_image(app_id, image)

    def set_secrets(self, app_id: str, secrets: dict[str, str]) -> bool:
        """Set environment variables for an app."""
        return self.deployment.set_secrets(app_id, secrets)

    def get_app_status(self, app_name: str) -> dict | None:
        """Get app status and details."""
        try:
            data = self.client.graphql(GET_APP_STATUS_QUERY, {"appName": app_name})
            return data.get("app")
        except Exception as e:
            print(f"Error getting app status: {e}")
            return None

    def delete_app(self, app_id: str) -> bool:
        """Delete a Fly.io app."""
        data = self.client.graphql(DELETE_APP_MUTATION, {"appId": app_id})

        if not data.get("deleteApp"):
            print("✗ Failed to delete app")
            return False

        print("✓ App deleted")
        return True
