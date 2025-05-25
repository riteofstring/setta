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

    def create_app(self, app_name: str):
        """Create a new Fly.io app - returns the app info"""

        if not self.api_token:
            print("ERROR: No API token available!")
            return None

        # For personal accounts, we'll create the app without specifying an organization
        # Fly.io will use the default personal organization
        mutation = """
        mutation($appName: String!) {
            createApp(input: {
                name: $appName
            }) {
                app {
                    id
                    name
                    hostname
                }
            }
        }
        """

        try:
            print(f"Creating app '{app_name}'...")

            with httpx.Client() as client:
                response = client.post(
                    self.base_url,
                    json={
                        "query": mutation,
                        "variables": {
                            "appName": app_name
                        }
                    },
                    headers=self.headers,
                    timeout=30.0
                )

                print(f"Response status: {response.status_code}")
                data = response.json()

                if "errors" in data:
                    print(f"Fly.io error: {data['errors']}")

                    # If organizationId is required, try with 'personal' slug
                    if any("organizationId" in str(err) for err in data["errors"]):
                        print("Retrying with 'personal' organization slug...")
                        return self._create_app_with_org_slug(app_name, "personal")

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

    def _create_app_with_org_slug(self, app_name: str, org_slug: str):
        """Fallback: Try creating with organization slug instead of ID"""

        # Some Fly.io endpoints accept slug as organizationId
        mutation = """
        mutation($appName: String!, $organizationId: ID!) {
            createApp(input: {
                name: $appName,
                organizationId: $organizationId
            }) {
                app {
                    id
                    name
                    hostname
                }
            }
        }
        """

        try:
            print(f"Creating app '{app_name}' with org slug '{org_slug}'...")

            with httpx.Client() as client:
                response = client.post(
                    self.base_url,
                    json={
                        "query": mutation,
                        "variables": {
                            "appName": app_name,
                            "organizationId": org_slug  # Try using slug
                        }
                    },
                    headers=self.headers,
                    timeout=30.0
                )

                data = response.json()

                if "errors" in data:
                    print(f"Fly.io error with slug: {data['errors']}")
                    return None

                if "data" in data and data["data"] and "createApp" in data["data"]:
                    app_info = data["data"]["createApp"]["app"]
                    print(f"App created successfully with slug: {app_info['hostname']}")

                    return {
                        "id": app_info["id"],
                        "name": app_info["name"],
                        "hostname": app_info["hostname"]
                    }

                return None

        except Exception as e:
            print(f"Exception with org slug: {type(e).__name__}: {e}")
            return None

    def delete_app(self, app_name: str):
        """Delete a Fly.io app"""

        mutation = """
        mutation($appName: String!) {
            deleteApp(appName: $appName) {
                app {
                    id
                }
            }
        }
        """

        try:
            with httpx.Client() as client:
                response = client.post(
                    self.base_url,
                    json={
                        "query": mutation,
                        "variables": {"appName": app_name}
                    },
                    headers=self.headers
                )

                data = response.json()

                if "errors" in data:
                    print(f"Error deleting app: {data['errors']}")

                return "errors" not in data

        except Exception as e:
            print(f"Exception deleting Fly app: {e}")
            return False
