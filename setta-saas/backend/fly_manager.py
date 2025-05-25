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

    def create_app(self, app_name: str):
        """Create a new Fly.io app - returns the app info"""

        # GraphQL mutation to create app
        mutation = """
        mutation($appName: String!) {
            createApp(input: {
                name: $appName,
                organizationId: "personal"
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
                        "variables": {"appName": app_name}
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
