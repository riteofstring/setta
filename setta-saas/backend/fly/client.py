"""
Fly.io API client for GraphQL and REST operations.
"""

import httpx

from config import get_settings


class FlyClient:
    """Client for interacting with Fly.io APIs."""

    def __init__(self, api_token: str | None = None):
        self.api_token = api_token or get_settings().fly_api_token
        self.graphql_url = "https://api.fly.io/graphql"
        self.machines_url = "https://api.machines.dev/v1"
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json",
        }

    def execute_graphql(self, query: str, variables: dict | None = None) -> dict:
        """Execute a GraphQL query against Fly.io API."""
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        with httpx.Client() as client:
            response = client.post(
                self.graphql_url,
                json=payload,
                headers=self.headers,
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json()

    def create_machine(self, app_name: str, config: dict, region: str = "ewr") -> dict:
        """Create a new machine for an app."""
        url = f"{self.machines_url}/apps/{app_name}/machines"

        # Add region to config
        config["region"] = region

        with httpx.Client() as client:
            response = client.post(
                url,
                json=config,
                headers=self.headers,
                timeout=60.0,  # Longer timeout for machine creation
            )
            response.raise_for_status()
            return response.json()

    def delete_machine(self, app_name: str, machine_id: str) -> bool:
        """Delete a machine."""
        url = f"{self.machines_url}/apps/{app_name}/machines/{machine_id}"

        with httpx.Client() as client:
            response = client.delete(
                url,
                headers=self.headers,
                timeout=30.0,
            )
            return response.status_code in [200, 204]

    def get_machine(self, app_name: str, machine_id: str) -> dict:
        """Get details of a specific machine."""
        url = f"{self.machines_url}/apps/{app_name}/machines/{machine_id}"

        with httpx.Client() as http:
            response = http.get(url, headers=self.headers, timeout=30.0)

            if response.status_code == 200:
                return response.json()
            elif response.status_code == 404:
                return {}
            else:
                response.raise_for_status()
                return {}

    def list_apps(self, org_slug: str = "personal") -> list[dict]:
        """List all apps using REST API."""
        url = f"{self.machines_url}/apps"

        with httpx.Client() as client:
            response = client.get(
                url,
                headers=self.headers,
                params={"org_slug": org_slug},
                timeout=30.0,
            )
            response.raise_for_status()
            return response.json().get("apps", [])

    def delete_app_rest(self, app_name: str, force: bool = False) -> dict:
        """Delete an app using REST API (can force delete)."""
        url = f"{self.machines_url}/apps/{app_name}"

        params = {}
        if force:
            params["force"] = "true"

        with httpx.Client() as client:
            response = client.delete(
                url,
                headers=self.headers,
                params=params,
                timeout=30.0,
            )

            if response.status_code in [200, 202, 204]:
                return {"success": True, "status_code": response.status_code}
            elif response.status_code == 404:
                return {"success": False, "status_code": 404, "error": f"App {app_name} not found"}
            else:
                return {
                    "success": False,
                    "status_code": response.status_code,
                    "error": response.text,
                }
