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

    def deploy_image(self, app_name: str, image: str) -> dict:
        """
        Deploy a Docker image to a Machines platform app.
        Uses minimal REST API just for machine creation.
        """
        print(f"Deploying {image} to app (Machines platform)...")

        # Create a machine with auto-start/stop configuration
        # The services configuration will trigger automatic IP allocation
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
                        "auto_stop_machines": {"enabled": True, "idle_timeout": "30m"},
                        "auto_start_machines": {"enabled": True, "min_machines_running": 0},
                    }
                ],
                "restart": {"policy": "on-failure", "max_retries": 3},
                "metadata": {"fly_platform_version": "v2"},
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
                    "app": {"name": app_name, "hostname": f"{app_name}.fly.dev"},
                    "machine": machine,
                }

        except Exception as e:
            print(f"✗ Deployment failed: {e}")
            raise

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
