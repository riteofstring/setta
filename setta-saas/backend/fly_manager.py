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
            with httpx.Client() as client:
                response = client.post(
                    self.base_url,
                    json={"query": query},
                    headers=self.headers
                )

                data = response.json()

                if "errors" in data:
                    print(f"Error getting organizations: {data['errors']}")
                    return

                orgs = data["data"]["viewer"]["organizations"]["nodes"]
                if orgs:
                    # Use the first organization
                    self.organization_id = orgs[0]["id"]
                    print(f"Using organization: {orgs[0]['name']} (slug: {orgs[0]['slug']})")
                else:
                    print("No organizations found!")

        except Exception as e:
            print(f"Error getting organization ID: {e}")

    def create_app(self, app_name: str):
        """Create a new Fly.io app - returns the app info"""

        if not self.organization_id:
            print("No organization ID available!")
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
                    print(f"Fly.io error: {data['errors']}")
                    return None

                app_info = data["data"]["createApp"]["app"]
                return {
                    "id": app_info["id"],
                    "name": app_info["name"],
                    "hostname": app_info["hostname"]
                }

        except Exception as e:
            print(f"Error creating Fly app: {e}")
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
