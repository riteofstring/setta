"""
Fly.io API client for GraphQL and REST operations.
"""

import httpx


class FlyClient:
    """Client for Fly.io API operations."""

    def __init__(self, api_token: str):
        self.api_token = api_token
        self.graphql_url = "https://api.fly.io/graphql"
        self.machines_url = "https://api.machines.dev/v1"
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }

    def execute_graphql(self, query: str, variables: dict = None) -> dict:
        """Execute a GraphQL query."""
        payload = {"query": query}
        if variables:
            payload["variables"] = variables

        with httpx.Client() as client:
            response = client.post(
                self.graphql_url, json=payload, headers=self.headers, timeout=30.0
            )

            response.raise_for_status()
            result = response.json()

            # Log errors for debugging
            if "errors" in result:
                print(f"GraphQL errors: {result['errors']}")

            return result

    def list_apps(self, org_slug: str = "personal") -> list[dict]:
        """List all apps in the organization using REST API."""
        url = f"{self.machines_url}/apps?org_slug={org_slug}"

        with httpx.Client() as client:
            response = client.get(url, headers=self.headers, timeout=30.0)
            response.raise_for_status()
            result = response.json()

            return result.get("apps", [])

    def create_machine(self, app_name: str, config: dict, region: str = "ewr") -> dict:
        """Create a machine via REST API."""
        url = f"{self.machines_url}/apps/{app_name}/machines"

        payload = {"region": region, "config": config}

        with httpx.Client() as client:
            response = client.post(url, json=payload, headers=self.headers, timeout=30.0)

            response.raise_for_status()
            return response.json()

    def get_machine(self, app_name: str, machine_id: str) -> dict:
        """Get machine details."""
        url = f"{self.machines_url}/apps/{app_name}/machines/{machine_id}"

        with httpx.Client() as client:
            response = client.get(url, headers=self.headers)
            response.raise_for_status()
            return response.json()

    def delete_machine(self, app_name: str, machine_id: str) -> bool:
        """Delete a machine."""
        url = f"{self.machines_url}/apps/{app_name}/machines/{machine_id}"

        with httpx.Client() as client:
            response = client.delete(url, headers=self.headers)
            return response.status_code == 200
