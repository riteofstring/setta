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

    def delete_app(self, app_name: str):
        """Delete a Fly.io app"""

        mutation = """
        mutation($appName: String!) {
            deleteApp(appName: $appName) {
                organization {
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
                    headers=self.headers,
                    timeout=30.0
                )

                data = response.json()

                if "errors" in data:
                    print(f"Error deleting app: {data['errors']}")

                return "errors" not in data

        except Exception as e:
            print(f"Exception deleting Fly app: {e}")
            return False
