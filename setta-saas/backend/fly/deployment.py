"""
Fly.io deployment operations - Hybrid approach.
Uses GraphQL for most operations, minimal REST for machine creation only.
"""

import httpx

from config import get_settings
from fly.client import FlyClient
from fly.queries import SET_SECRETS_MUTATION


class FlyDeployment:
    """Handles Fly.io deployment operations via hybrid GraphQL/REST approach."""

    def __init__(self, client: FlyClient):
        self.client = client
        settings = get_settings()
        self.api_token = settings.fly_api_token
        self.machines_url = "https://api.machines.dev/v1"

    def deploy_image(self, app_id: str, image: str) -> dict:
        """
        Deploy a Docker image to a Machines platform app.
        Uses minimal REST API just for machine creation.
        """
        print(f"Deploying {image} to app (Machines platform)...")

        # First get app name from app_id using GraphQL
        app_info = self._get_app_info(app_id)
        if not app_info:
            raise Exception("App not found")

        app_name = app_info["name"]

        # Create a machine with auto-start/stop configuration
        machine_config = {
            "region": "ord",
            "config": {
                "image": image,
                "auto_destroy": False,
                "services": [
                    {
                        "ports": [
                            {"port": 443, "handlers": ["tls", "http"]},
                            {"port": 80, "handlers": ["http"]},
                        ],
                        "protocol": "tcp",
                        "internal_port": 8080,
                        "concurrency": {"type": "connections", "hard_limit": 25, "soft_limit": 20},
                    }
                ],
                "restart": {"policy": "on-failure", "max_retries": 3},
            },
        }

        # Single REST call to create the machine
        try:
            headers = {
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": "application/json",
            }

            with httpx.Client() as client:
                response = client.post(
                    f"{self.machines_url}/apps/{app_name}/machines",
                    json=machine_config,
                    headers=headers,
                    timeout=60.0,
                )

                if response.status_code not in [200, 201]:
                    raise Exception(
                        f"Machine creation failed: {response.status_code} - {response.text}"
                    )

                machine = response.json()
                print("✓ Machine created successfully!")
                print(f"  Machine ID: {machine.get('id')}")
                print(f"  App: {app_name}")

                return {
                    "app": {"id": app_id, "name": app_name, "hostname": app_info["hostname"]},
                    "machine": machine,
                }

        except Exception as e:
            print(f"✗ Deployment failed: {e}")
            raise

    def _get_app_info(self, app_id: str) -> dict:
        """Get app info using GraphQL."""
        query = """
        query($appId: ID!) {
            node(id: $appId) {
                ... on App {
                    id
                    name
                    hostname
                }
            }
        }
        """

        result = self.client.graphql(query, {"appId": app_id})
        return result.get("node")

    def set_secrets(self, app_id: str, secrets: dict[str, str]) -> bool:
        """
        Set environment variables/secrets for an app (uses GraphQL).
        """
        print(f"Setting {len(secrets)} secrets...")

        # Convert dict to list of {key, value} objects
        secret_list = [{"key": k, "value": v} for k, v in secrets.items()]

        variables = {"input": {"appId": app_id, "secrets": secret_list}}

        try:
            result = self.client.graphql(SET_SECRETS_MUTATION, variables)

            if result.get("setSecrets"):
                print("✓ Secrets updated successfully")
                return True
            else:
                print("✗ Failed to set secrets")
                return False

        except Exception as e:
            print(f"✗ Error setting secrets: {e}")
            return False
