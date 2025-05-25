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
        self.organization_id = None

        # Check if token exists
        if not self.api_token:
            print("ERROR: FLY_API_TOKEN not found in environment variables!")
        else:
            print(f"FLY_API_TOKEN found: {self.api_token[:10]}...")
            self._get_organization_id()

    def _get_organization_id(self):
        """Get the first organization ID for this user"""
        query = """
        query {
            viewer {
                organizations {
                    nodes {
                        id
                        slug
                        name
                    }
                }
            }
        }
        """

        try:
            print("Fetching organizations from Fly.io...")

            with httpx.Client() as client:
                response = client.post(
                    self.base_url,
                    json={"query": query},
                    headers=self.headers,
                    timeout=10.0
                )

                print(f"Response status: {response.status_code}")

                data = response.json()
                print(f"Response data: {data}")

                if "errors" in data:
                    print(f"GraphQL errors: {data['errors']}")
                    return

                # Navigate the response structure
                if "data" not in data:
                    print("No 'data' field in response")
                    return

                if "viewer" not in data["data"]:
                    print("No 'viewer' field in data")
                    return

                if "organizations" not in data["data"]["viewer"]:
                    print("No 'organizations' field in viewer")
                    return

                orgs = data["data"]["viewer"]["organizations"]["nodes"]

                if orgs and len(orgs) > 0:
                    # Use the first organization
                    self.organization_id = orgs[0]["id"]
                    print(f"SUCCESS: Using organization: {orgs[0]['name']} (ID: {self.organization_id}, slug: {orgs[0]['slug']})")
                else:
                    print("No organizations found in response!")

        except Exception as e:
            print(f"Exception getting organization ID: {type(e).__name__}: {e}")

    def create_app(self, app_name: str):
        """Create a new Fly.io app - returns the app info"""

        if not self.api_token:
            print("ERROR: No API token available!")
            return None

        if not self.organization_id:
            print("ERROR: No organization ID available!")
            return None

        # GraphQL mutation to create app
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
            print(f"Creating app '{app_name}' in org {self.organization_id}")

            with httpx.Client() as client:
                response = client.post(
                    self.base_url,
                    json={
                        "query": mutation,
                        "variables": {
                            "appName": app_name,
                            "organizationId": self.organization_id
                        }
                    },
                    headers=self.headers
                )

                data = response.json()

                if "errors" in data:
                    print(f"Fly.io create app error: {data['errors']}")
                    return None

                app_info = data["data"]["createApp"]["app"]
                print(f"App created successfully: {app_info['hostname']}")

                return {
                    "id": app_info["id"],
                    "name": app_info["name"],
                    "hostname": app_info["hostname"]
                }

        except Exception as e:
            print(f"Exception creating Fly app: {type(e).__name__}: {e}")
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
                return "errors" not in data

        except Exception as e:
            print(f"Error deleting Fly app: {e}")
            return False
