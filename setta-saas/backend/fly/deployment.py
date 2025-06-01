"""
Fly.io deployment operations using GraphQL.
High-level operations that let Fly.io manage everything automatically.
"""

from .client import FlyClient
from .queries import DEPLOY_IMAGE_MUTATION, SET_SECRETS_MUTATION


class FlyDeployment:
    """Handles high-level Fly.io deployment operations via GraphQL."""

    def __init__(self, client: FlyClient):
        self.client = client

    def deploy_image(self, app_id: str, image: str) -> dict:
        """
        Deploy a Docker image to an app using GraphQL.
        Fly.io automatically manages all machines, scaling, etc.
        """
        print(f"Deploying {image} to app...")

        variables = {"input": {"appId": app_id, "image": image}}

        try:
            result = self.client.graphql(DEPLOY_IMAGE_MUTATION, variables)

            if result.get("deployImage"):
                deploy_result = result["deployImage"]
                app = deploy_result.get("app", {})
                release = deploy_result.get("release", {})

                print("✓ Deployment successful!")
                print(f"  App: {app.get('name')} ({app.get('hostname')})")
                if release:
                    print(f"  Release: v{release.get('version')}")

                return deploy_result
            else:
                raise Exception("Deployment failed - no result returned")

        except Exception as e:
            print(f"✗ Deployment failed: {e}")
            raise

    def set_secrets(self, app_id: str, secrets: dict[str, str]) -> bool:
        """
        Set environment variables/secrets for an app.
        Fly.io will automatically restart machines with new config.
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
