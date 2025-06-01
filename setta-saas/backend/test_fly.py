#!/usr/bin/env python3
"""
Test Fly.io integration - creates and tests a simple app
This uses a hybrid approach: GraphQL for app management, fly CLI for deployment
"""

import os
import subprocess
import time
from typing import Optional

import httpx
from dotenv import load_dotenv

load_dotenv()


class FlyGraphQLClient:
    """Simple Fly.io GraphQL client"""

    def __init__(self, api_token: str):
        self.api_token = api_token
        self.graphql_url = "https://api.fly.io/graphql"
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        }
        self.org_slug = None

    def execute(self, query: str, variables: dict = None) -> Optional[dict]:
        """Execute a GraphQL query"""
        try:
            response = httpx.post(
                self.graphql_url,
                headers=self.headers,
                json={"query": query, "variables": variables or {}},
                timeout=30.0,
            )

            if response.status_code != 200:
                print(f"GraphQL error: {response.status_code} - {response.text}")
                return None

            data = response.json()
            if "errors" in data:
                print(f"GraphQL errors: {data['errors']}")
                return None

            return data.get("data")
        except Exception as e:
            print(f"Request failed: {e}")
            return None

    def get_personal_organization(self) -> Optional[str]:
        """Get the personal organization slug"""
        query = """
        query {
            personalOrganization {
                id
                slug
                name
            }
        }
        """

        result = self.execute(query)
        if result and "personalOrganization" in result:
            org = result["personalOrganization"]
            self.org_slug = org["slug"]
            print(f"✓ Found personal organization: {org['name']} (slug: {org['slug']})")
            return org["slug"]
        return None

    def check_app_exists(self, app_name: str) -> bool:
        """Check if an app already exists"""
        query = """
        query($appName: String!) {
            app(name: $appName) {
                name
            }
        }
        """

        result = self.execute(query, {"appName": app_name})
        return result and "app" in result and result["app"] is not None

    def get_app_info(self, app_name: str) -> dict:
        """Get detailed app information"""
        query = """
        query($appName: String!) {
            app(name: $appName) {
                id
                name
                hostname
                status
                deployed
                ipAddresses {
                    nodes {
                        address
                        type
                    }
                }
                allocations {
                    id
                    status
                    region
                }
            }
        }
        """

        result = self.execute(query, {"appName": app_name})
        return result.get("app", {}) if result else {}

    def delete_app(self, app_name: str) -> bool:
        """Delete an app using the correct mutation"""
        # First get the app ID
        app_info = self.get_app_info(app_name)
        if not app_info or "id" not in app_info:
            print(f"App {app_name} not found")
            return False

        app_id = app_info["id"]

        mutation = """
        mutation($appId: ID!) {
            deleteApp(appId: $appId) {
                deletedAppId
            }
        }
        """

        result = self.execute(mutation, {"appId": app_id})
        return result is not None


def run_fly_command(args: list[str]) -> tuple[bool, str]:
    """Run a fly CLI command and return success status and output"""
    try:
        result = subprocess.run(
            ["fly"] + args, capture_output=True, text=True, check=False
        )
        success = result.returncode == 0
        output = result.stdout if success else result.stderr
        return success, output.strip()
    except FileNotFoundError:
        return (
            False,
            "fly CLI not found. Please install: https://fly.io/docs/flyctl/install/",
        )


def create_test_dockerfile(app_name: str) -> str:
    """Create a minimal Dockerfile for testing"""
    content = f"""FROM nginx:alpine
COPY <<EOF /usr/share/nginx/html/index.html
<!DOCTYPE html>
<html>
<head><title>Test App - {app_name}</title></head>
<body>
<h1>Hello from Fly.io!</h1>
<p>This is test app: {app_name}</p>
<p>If you can see this, the deployment worked! 🎉</p>
</body>
</html>
EOF

EXPOSE 80
"""

    with open("Dockerfile.test", "w") as f:
        f.write(content)

    return "Dockerfile.test"


def create_fly_toml(app_name: str) -> str:
    """Create a fly.toml config file"""
    content = f"""app = "{app_name}"
primary_region = "ord"

[build]
  dockerfile = "Dockerfile.test"

[http_service]
  internal_port = 80
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 256
"""

    with open("fly.toml", "w") as f:
        f.write(content)

    return "fly.toml"


def check_url_accessible(url: str, max_attempts: int = 20) -> bool:
    """Check if URL is accessible"""
    print(f"\nChecking if {url} is accessible...")

    for i in range(max_attempts):
        try:
            response = httpx.get(url, follow_redirects=True, timeout=5.0)
            if response.status_code == 200:
                print(f"✓ URL is accessible! Status: {response.status_code}")
                if "Hello from Fly.io" in response.text:
                    print("✓ Deployment verified - custom content is live!")
                return True
            else:
                print(f"  Attempt {i + 1}: Status {response.status_code}")
        except Exception as e:
            print(f"  Attempt {i + 1}: {type(e).__name__}")

        if i < max_attempts - 1:
            time.sleep(3)

    return False


def main():
    """Run the test"""
    print("=== FLY.IO INTEGRATION TEST ===\n")

    # Check for fly CLI
    success, output = run_fly_command(["version"])
    if not success:
        print(f"❌ {output}")
        return
    print(f"✓ Fly CLI found: {output}")

    # Get API token
    api_token = os.getenv("FLY_API_TOKEN")
    if not api_token:
        print("❌ FLY_API_TOKEN not found in environment")
        print("   Set it in your .env file or run: fly auth token")
        return

    print(f"✓ Found API token: {api_token[:10]}...")

    # Initialize GraphQL client
    client = FlyGraphQLClient(api_token)

    # Get organization
    org_slug = client.get_personal_organization()
    if not org_slug:
        print("❌ Could not find personal organization")
        return

    # Generate test app name
    test_app_name = f"test-setta-{int(time.time())}"
    test_url = f"https://{test_app_name}.fly.dev"
    dockerfile_path = None
    fly_toml_path = None
    app_created = False

    try:
        # 1. Check if app already exists
        print(f"\n1. Checking if app '{test_app_name}' exists...")
        if client.check_app_exists(test_app_name):
            print("⚠️  App already exists, using a different name")
            test_app_name = f"test-setta-{int(time.time() + 1)}"
            test_url = f"https://{test_app_name}.fly.dev"

        # 2. Create test files
        print("\n2. Creating test files...")
        dockerfile_path = create_test_dockerfile(test_app_name)
        print(f"✓ Created {dockerfile_path}")

        fly_toml_path = create_fly_toml(test_app_name)
        print(f"✓ Created {fly_toml_path}")

        # 3. Create and deploy app using fly CLI
        print(f"\n3. Creating and deploying app '{test_app_name}'...")

        # fly launch creates the app and deploys in one step
        launch_args = [
            "launch",
            "--now",  # Deploy immediately
            "--yes",  # Auto-confirm
        ]

        print(f"Running: fly {' '.join(launch_args)}")
        success, output = run_fly_command(launch_args)

        if not success:
            print(f"❌ Failed to launch app: {output}")
            return

        print("✓ App created and deployment started")
        app_created = True

        # 4. Wait a bit for deployment to complete
        print("\n4. Waiting for deployment to complete...")
        time.sleep(10)  # Initial wait

        # 5. Check app status
        print("\n5. Checking app status...")
        app_info = client.get_app_info(test_app_name)

        if app_info:
            print(f"  - Name: {app_info.get('name')}")
            print(f"  - Hostname: {app_info.get('hostname')}")
            print(f"  - Deployed: {app_info.get('deployed')}")

            if app_info.get("ipAddresses", {}).get("nodes"):
                print("  - IP Addresses:")
                for ip in app_info["ipAddresses"]["nodes"]:
                    print(f"    • {ip['address']} ({ip['type']})")

        # 6. Test accessibility
        print("\n6. Testing URL accessibility...")
        if check_url_accessible(test_url):
            print(f"\n✅ SUCCESS! App is live at: {test_url}")
            print("   Click the URL above to see your deployed app!")
        else:
            print("\n⚠️  App deployed but not immediately accessible")
            print(f"   URL: {test_url}")
            print("   This is normal - DNS propagation can take 1-2 minutes")
            print("   Try refreshing the URL in a moment")

    finally:
        # Cleanup
        print("\n7. Cleaning up...")

        # Delete test files
        if dockerfile_path and os.path.exists(dockerfile_path):
            os.remove(dockerfile_path)
            print(f"✓ Removed {dockerfile_path}")

        if fly_toml_path and os.path.exists(fly_toml_path):
            os.remove(fly_toml_path)
            print(f"✓ Removed {fly_toml_path}")

        # Delete app
        if app_created:
            print(f"Deleting test app '{test_app_name}'...")
            if client.delete_app(test_app_name):
                print("✓ Test app deleted via GraphQL")
            else:
                # Fallback to CLI
                success, _ = run_fly_command(
                    ["apps", "destroy", test_app_name, "--yes"]
                )
                if success:
                    print("✓ Test app deleted via CLI")
                else:
                    print(f"⚠️  Manual cleanup needed: fly apps destroy {test_app_name}")

    print("\n=== TEST COMPLETE ===")


if __name__ == "__main__":
    main()
