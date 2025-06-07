"""
Fly.io API service for creating and managing apps.
"""

import logging
import subprocess

import httpx

from fly.queries import (
    ALLOCATE_IPV4_MUTATION,
    ALLOCATE_IPV6_MUTATION,
    CREATE_APP_MUTATION,
    DELETE_APP_MUTATION,
    GET_APP_QUERY,
    GET_ORGANIZATION_QUERY,
)

logger = logging.getLogger(__name__)


class FlyService:
    """Service for managing Fly.io apps."""

    def __init__(self, api_token: str):
        self.api_token = api_token
        self.graphql_url = "https://api.fly.io/graphql"
        self.machines_url = "https://api.machines.dev/v1"
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }

    def get_organization(self) -> str | None:
        """Get the default organization slug."""
        response = httpx.post(
            self.graphql_url,
            headers=self.headers,
            json={"query": GET_ORGANIZATION_QUERY},
        )

        if response.status_code != 200:
            logger.error(f"Failed to get organization: {response.text}")
            return None

        data = response.json()
        if errors := data.get("errors"):
            logger.error(f"GraphQL errors: {errors}")
            return None

        # Get personal organization
        orgs = data.get("data", {}).get("viewer", {}).get("organizations", {}).get("nodes", [])
        for org in orgs:
            if org.get("type") == "PERSONAL":
                return org.get("slug")

        # Fallback to first org if no personal org
        return orgs[0].get("slug") if orgs else None

    def create_app(self, app_name: str) -> dict | None:
        """Create a new Fly.io app and allocate IP addresses."""
        # Get organization
        org_slug = self.get_organization()
        if not org_slug:
            logger.error("Failed to get organization")
            return None

        # Create the app
        logger.info(f"Creating app '{app_name}'...")
        response = httpx.post(
            self.graphql_url,
            headers=self.headers,
            json={
                "query": CREATE_APP_MUTATION,
                "variables": {
                    "input": {
                        "name": app_name,
                        "organizationId": org_slug,
                    }
                },
            },
        )

        if response.status_code != 200:
            logger.error(f"Failed to create app: {response.text}")
            return None

        data = response.json()
        if errors := data.get("errors"):
            logger.error(f"GraphQL errors: {errors}")
            return None

        app_data = data.get("data", {}).get("createApp", {}).get("app")
        if not app_data:
            logger.error("No app data in response")
            return None

        logger.info(f"✓ App created: {app_data['hostname']}")

        # Allocate IPv4 address
        if not self._allocate_ipv4(app_name):
            logger.warning("Failed to allocate IPv4, continuing...")

        # Allocate IPv6 address
        if not self._allocate_ipv6(app_name):
            logger.warning("Failed to allocate IPv6, continuing...")

        # Deploy the app
        if not self._deploy_app(app_name):
            logger.error("Failed to deploy app")
            return None

        return {
            "id": app_data["id"],
            "name": app_data["name"],
            "hostname": app_data["hostname"],
        }

    def _allocate_ipv4(self, app_name: str) -> bool:
        """Allocate shared IPv4 address for the app."""
        logger.info("Allocating shared IPv4...")
        response = httpx.post(
            self.graphql_url,
            headers=self.headers,
            json={
                "query": ALLOCATE_IPV4_MUTATION,
                "variables": {
                    "input": {
                        "appId": app_name,
                        "type": "shared_v4",
                        "region": "",
                    }
                },
            },
        )

        if response.status_code != 200:
            logger.error(f"Failed to allocate IPv4: {response.text}")
            return False

        data = response.json()
        if errors := data.get("errors"):
            logger.error(f"IPv4 allocation errors: {errors}")
            return False

        logger.info("✓ Shared IPv4 allocated")
        return True

    def _allocate_ipv6(self, app_name: str) -> bool:
        """Allocate dedicated IPv6 address for the app."""
        logger.info("Allocating dedicated IPv6...")
        response = httpx.post(
            self.graphql_url,
            headers=self.headers,
            json={
                "query": ALLOCATE_IPV6_MUTATION,
                "variables": {
                    "input": {
                        "appId": app_name,
                        "type": "v6",
                        "region": "",
                    }
                },
            },
        )

        if response.status_code != 200:
            logger.error(f"Failed to allocate IPv6: {response.text}")
            return False

        data = response.json()
        if errors := data.get("errors"):
            logger.error(f"IPv6 allocation errors: {errors}")
            return False

        logger.info("✓ Dedicated IPv6 allocated")
        return True

    def _deploy_app(self, app_name: str) -> bool:
        """Deploy the app using fly CLI."""
        logger.info("Deploying...")

        # Use fly CLI for initial deployment (simpler than machines API)
        try:
            subprocess.run(
                ["fly", "deploy", "--app", app_name, "--image", "flyio/hellofly:latest", "--now"],
                capture_output=True,
                text=True,
                check=True,
            )
            logger.info("✓ App deployed successfully")
            return True
        except subprocess.CalledProcessError as e:
            logger.error(f"Deploy failed: {e.stderr}")
            return False

    def delete_app(self, app_name: str) -> bool:
        """Delete a Fly.io app."""
        logger.info(f"Deleting app '{app_name}'...")

        response = httpx.post(
            self.graphql_url,
            headers=self.headers,
            json={
                "query": DELETE_APP_MUTATION,
                "variables": {"appId": app_name},
            },
        )

        if response.status_code != 200:
            logger.error(f"Failed to delete app: {response.text}")
            return False

        data = response.json()
        if errors := data.get("errors"):
            logger.error(f"GraphQL errors: {errors}")
            return False

        logger.info("✓ App deleted successfully")
        return True

    def get_app_status(self, app_name: str) -> dict | None:
        """Get app status and details."""
        response = httpx.post(
            self.graphql_url,
            headers=self.headers,
            json={
                "query": GET_APP_QUERY,
                "variables": {"appName": app_name},
            },
        )

        if response.status_code != 200:
            logger.error(f"Failed to get app status: {response.text}")
            return None

        data = response.json()
        if errors := data.get("errors"):
            logger.error(f"GraphQL errors: {errors}")
            return None

        return data.get("data", {}).get("app")
