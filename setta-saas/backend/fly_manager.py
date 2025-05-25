# backend/fly_manager.py
import httpx
import os
from dotenv import load_dotenv

load_dotenv()

class FlyManager:
    def __init__(self):
        self.api_token = os.getenv("FLY_API_TOKEN")
        self.base_url = "https://api.fly.io/graphql"
        self.headers = {
            "Authorization": f"Bearer {self.api_token}",
            "Content-Type": "application/json"
        }

        if not self.api_token:
            print("ERROR: FLY_API_TOKEN not found in environment variables!")
        else:
            print(f"FLY_API_TOKEN found: {self.api_token[:10]}...")
            # Get organization ID dynamically
            self.organization_id = self.get_organization_id()
            print(f"Organization ID: {self.organization_id}")

    def get_organization_id(self):
        """Get the organization ID for the authenticated user"""
        query = """
        query {
            viewer {
                organizations {
                    nodes {
                        id
                        slug
                        name
                        type
                    }
                }
            }
        }
        """

        try:
            with httpx.Client() as client:
                response = client.post(
                    self.base_url,
                    json={"query": query},
                    headers=self.headers,
                    timeout=30.0
                )

                data = response.json()

                if "errors" in data:
                    print(f"Error getting organizations: {data['errors']}")
                    return None

                if "data" in data and data["data"]["viewer"]["organizations"]["nodes"]:
                    orgs = data["data"]["viewer"]["organizations"]["nodes"]
                    # Find personal organization
                    for org in orgs:
                        if org["type"] == "PERSONAL" or org["slug"] == "personal":
                            print(f"Found personal org: {org['name']} (ID: {org['id']})")
                            return org["id"]

                    # If no personal org found, use the first one
                    if orgs:
                        print(f"Using first org: {orgs[0]['name']} (ID: {orgs[0]['id']})")
                        return orgs[0]["id"]

                return None

        except Exception as e:
            print(f"Exception getting organization: {e}")
            return None

    def create_app(self, app_name: str):
        """Create a new Fly.io app - returns the app info"""

        if not self.api_token:
            print("ERROR: No API token available!")
            return None

        if not self.organization_id:
            print("ERROR: No organization ID available!")
            return None

        # Correct GraphQL mutation
        mutation = """
        mutation($input: CreateAppInput!) {
            createApp(input: $input) {
                app {
                    id
                    name
                    hostname
                }
            }
        }
        """

        try:
            print(f"Creating app '{app_name}' in organization {self.organization_id}")

            with httpx.Client() as client:
                response = client.post(
                    self.base_url,
                    json={
                        "query": mutation,
                        "variables": {
                            "input": {
                                "name": app_name,
                                "organizationId": self.organization_id
                            }
                        }
                    },
                    headers=self.headers,
                    timeout=30.0
                )

                data = response.json()

                print(f"Fly.io response: {data}")  # Debug output

                if "errors" in data:
                    print(f"Fly.io error: {data['errors']}")
                    return None

                if "data" in data and data["data"] and "createApp" in data["data"]:
                    app_info = data["data"]["createApp"]["app"]
                    print(f"App created successfully: {app_info['hostname']}")

                    return {
                        "id": app_info["id"],
                        "name": app_info["name"],
                        "hostname": app_info["hostname"]
                    }
                else:
                    print("Unexpected response structure:", data)
                    return None

        except Exception as e:
            print(f"Exception creating Fly app: {type(e).__name__}: {e}")
            return None

    def deploy_to_app(self, app_name: str):
        """Deploy using Fly's v2 configuration"""

        # First, set the app configuration
        config_mutation = """
        mutation($appName: String!, $config: AppConfigInput!) {
            setAppConfig(appName: $appName, config: $config) {
                app {
                    id
                    name
                }
            }
        }
        """

        app_config = {
            "definition": {
                "app": app_name,
                "primary_region": "ord",
                "services": [
                    {
                        "internal_port": 8080,
                        "protocol": "tcp",
                        "force_https": True,
                        "auto_stop_machines": True,
                        "auto_start_machines": True,
                        "min_machines_running": 0,
                        "ports": [
                            {"port": 80, "handlers": ["http"]},
                            {"port": 443, "handlers": ["tls", "http"]}
                        ]
                    }
                ],
                "env": {
                    "PROJECT_NAME": app_name
                }
            }
        }

        try:
            # Set the configuration
            with httpx.Client() as client:
                response = client.post(
                    self.base_url,
                    json={
                        "query": config_mutation,
                        "variables": {
                            "appName": app_name,
                            "config": app_config
                        }
                    },
                    headers=self.headers
                )

                print(f"Config response: {response.json()}")

            # Then deploy with fly deploy command or machines API
            return self.deploy_to_app(app_name)

        except Exception as e:
            print(f"Error in v2 deployment: {e}")
            return False
