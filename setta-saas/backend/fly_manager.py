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

        if not self.api_token:
            print("ERROR: FLY_API_TOKEN not found in environment variables!")
        else:
            print(f"FLY_API_TOKEN found: {self.api_token[:10]}...")
            # Try to get org ID from existing apps
            self._get_organization_from_apps()

    def _get_organization_from_apps(self):
        """Try to get organization ID from existing apps"""
        query = """
        query {
            apps {
                nodes {
                    id
                    name
                    organization {
                        id
                        slug
                        name
                    }
                }
            }
        }
        """

        try:
            print("Fetching existing apps to find organization ID...")

            with httpx.Client() as client:
                response = client.post(
                    self.base_url,
                    json={"query": query},
                    headers=self.headers,
                    timeout=10.0
                )

                data = response.json()

                if "errors" in data:
                    print(f"Error fetching apps: {data['errors']}")
                    # If this fails, try the personal org ID pattern
                    self._try_personal_org_pattern()
                    return

                if "data" in data and data["data"] and "apps" in data["data"]:
                    apps = data["data"]["apps"]["nodes"]
                    if apps and len(apps) > 0:
                        # Get org from first app
                        org = apps[0]["organization"]
                        self.organization_id = org["id"]
                        print(f"Found organization from existing app: {org['name']} (ID: {self.organization_id})")
                    else:
                        print("No existing apps found")
                        self._try_personal_org_pattern()

        except Exception as e:
            print(f"Exception getting org from apps: {e}")
            self._try_personal_org_pattern()

    def _try_personal_org_pattern(self):
        """Try common patterns for personal organization IDs"""
        # Get user info first
        query = """
        query {
            viewer {
                email
                id
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

                if "data" in data and data["data"] and "viewer" in data["data"]:
                    user_id = data["data"]["viewer"]["id"]
                    # Try common personal org ID patterns
                    possible_ids = [
                        f"organization_{user_id}",
                        f"org_{user_id}",
                        user_id,  # Sometimes user ID is org ID
                    ]

                    print(f"User ID: {user_id}")
                    print("Will try these organization IDs:", possible_ids)

                    # We'll try these in create_app
                    self.possible_org_ids = possible_ids

        except Exception as e:
            print(f"Exception getting user info: {e}")

    def create_app(self, app_name: str):
        """Create a new Fly.io app - returns the app info"""

        if not self.api_token:
            print("ERROR: No API token available!")
            return None

        # Try with discovered org ID first
        if self.organization_id:
            result = self._try_create_app(app_name, self.organization_id)
            if result:
                return result

        # Try possible org IDs
        if hasattr(self, 'possible_org_ids'):
            for org_id in self.possible_org_ids:
                print(f"Trying with org ID: {org_id}")
                result = self._try_create_app(app_name, org_id)
                if result:
                    self.organization_id = org_id  # Save for future use
                    return result

        # Last resort: try without org ID (though we know this fails)
        print("All organization ID attempts failed")
        return None

    def _try_create_app(self, app_name: str, org_id: str):
        """Try to create app with specific org ID"""
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
                            "organizationId": org_id
                        }
                    },
                    headers=self.headers,
                    timeout=30.0
                )

                data = response.json()

                if "errors" in data:
                    print(f"Failed with org ID {org_id}: {data['errors'][0]['message']}")
                    return None

                if "data" in data and data["data"] and "createApp" in data["data"]:
                    app_info = data["data"]["createApp"]["app"]
                    print(f"SUCCESS! App created: {app_info['hostname']}")

                    return {
                        "id": app_info["id"],
                        "name": app_info["name"],
                        "hostname": app_info["hostname"]
                    }

                return None

        except Exception as e:
            print(f"Exception with org ID {org_id}: {e}")
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
