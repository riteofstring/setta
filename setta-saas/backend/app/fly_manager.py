import time
from typing import List, Optional

from app.config import settings
from app.models import (
    AppInfo,
    CreateAppRequest,
    CreateMachineRequest,
    Machine,
    MachineState,
)
from app.models import AppStatus as AppStatusModel
from app.utils import HTTPClient, is_success, parse_json


class FlyManager:
    """Manages Fly.io app lifecycle using REST APIs"""

    def __init__(self):
        self.api_token = settings.fly_api_token
        self.api_base = "https://api.machines.dev/v1"

        print(f"FLY_API_TOKEN found: {self.api_token[:10]}...")

        self.client = HTTPClient(
            headers={
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": "application/json",
            }
        )

    def create_app(self, app_name: str) -> Optional[AppInfo]:
        """Create a new Fly.io app"""
        print(f"Creating app '{app_name}'...")

        # Create the app
        request = CreateAppRequest(app_name=app_name)
        response = self.client.post(f"{self.api_base}/apps", json=request.model_dump())

        if not is_success(response):
            if response:
                print(f"Failed to create app: {response.status_code} - {response.text}")
            return None

        app_data = parse_json(response)
        if not app_data:
            print("Failed to parse app creation response")
            return None

        # Wait for app to be ready
        print("Waiting for app to be ready...")
        for i in range(10):
            time.sleep(1)
            verify_response = self.client.get(f"{self.api_base}/apps/{app_name}")
            if is_success(verify_response):
                print(f"✓ App verified after {i + 1} seconds")
                break

        app_info = AppInfo(
            name=app_name,
            hostname=f"{app_name}.fly.dev",
        )

        print(f"App created successfully: {app_info.hostname}")
        return app_info

    def deploy_to_app(self, app_name: str) -> bool:
        """Deploy a machine to the app"""
        print(f"=== STARTING DEPLOYMENT FOR {app_name} ===")

        # Create and launch machine
        machine_id = self._create_and_launch_machine(app_name)
        if not machine_id:
            return False

        print("=== DEPLOYMENT COMPLETE ===")
        return True

    def _create_and_launch_machine(self, app_name: str) -> Optional[str]:
        """Create and launch a machine in one step"""
        url = f"{self.api_base}/apps/{app_name}/machines"

        request = CreateMachineRequest.default_config(app_name)

        print(f"Creating machine for app {app_name}...")

        response = self.client.post(url, json=request.model_dump(), timeout=60.0)

        if not response:
            print("No response from API")
            return None

        if response.status_code == 404:
            print(f"App {app_name} not found")
            return None

        if not is_success(response):
            print(f"Failed with status {response.status_code}: {response.text}")
            return None

        machine_data = parse_json(response)
        if not machine_data:
            print("Failed to parse machine response")
            return None

        machine_id = machine_data.get("id")
        if not machine_id:
            print("No machine ID in response")
            return None

        print(f"✓ Machine created with ID: {machine_id}")

        # Wait for machine to start
        if not self._wait_for_machine(app_name, machine_id):
            return None

        return machine_id

    def _wait_for_machine(self, app_name: str, machine_id: str, timeout: int = 30):
        """Wait for machine to start"""
        print(f"Waiting for machine {machine_id} to start...")

        for i in range(timeout):
            response = self.client.get(
                f"{self.api_base}/apps/{app_name}/machines/{machine_id}"
            )
            if not is_success(response):
                time.sleep(1)
                continue

            machine_data = parse_json(response)
            if not machine_data:
                time.sleep(1)
                continue

            state = machine_data.get("state")
            print(f"Machine state: {state}")

            if state == "started":
                print(f"✓ Machine started after {i + 1} seconds")
                return True

            time.sleep(1)

        print("Timeout waiting for machine to start")
        return False

    def get_app_status(self, app_name: str) -> Optional[AppStatusModel]:
        """Check if an app exists and get its status"""
        response = self.client.get(f"{self.api_base}/apps/{app_name}")

        if not response:
            return None

        if response.status_code == 404:
            return None

        if not is_success(response):
            return None

        app_data = parse_json(response)
        if not app_data:
            return None

        # Get machines
        machines = self.list_machines(app_name)
        deployed = any(m.state == MachineState.STARTED for m in machines)

        return AppStatusModel(
            id=app_data.get("id"),
            name=app_data.get("name", app_name),
            hostname=app_data.get("hostname", f"{app_name}.fly.dev"),
            status=app_data.get("status", "unknown"),
            deployed=deployed,
            machines=machines,
        )

    def list_machines(self, app_name: str) -> List[Machine]:
        """List all machines for an app"""
        response = self.client.get(f"{self.api_base}/apps/{app_name}/machines")

        if not is_success(response):
            return []

        machines_data = parse_json(response) or []
        if not isinstance(machines_data, list):
            return []

        machines = []
        for data in machines_data:
            try:
                machine = Machine.model_validate(data)
                machines.append(machine)
            except Exception as e:
                print(f"Failed to parse machine data: {e}")

        return machines

    def delete_app(self, app_name: str) -> bool:
        """Delete a Fly.io app and all its machines"""
        # Delete machines first
        machines = self.list_machines(app_name)
        for machine in machines:
            self._delete_machine(app_name, machine.id)

        # Delete the app
        response = self.client.delete(f"{self.api_base}/apps/{app_name}")
        if response and response.status_code in [202, 204, 404]:
            print(f"✓ App {app_name} deleted")
            return True

        return False

    def _delete_machine(self, app_name: str, machine_id: str) -> bool:
        """Delete a specific machine"""
        url = f"{self.api_base}/apps/{app_name}/machines/{machine_id}?force=true"
        response = self.client.delete(url)
        return response and response.status_code in [200, 204, 404]
