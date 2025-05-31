import time
from typing import List, Optional

from config import settings
from models import (
    AllocateIPRequest,
    AppInfo,
    CreateAppRequest,
    CreateMachineRequest,
    IPAddressType,
    Machine,
    MachineState,
)
from models import AppStatus as AppStatusModel
from utils import HTTPClient, is_success, parse_json


class FlyManager:
    """Manages Fly.io app lifecycle using REST APIs"""

    def __init__(self):
        self.api_token = settings.fly_api_token
        self.api_base = "https://api.fly.io/v1"
        self.machines_base = "https://api.machines.dev/v1"

        print(f"FLY_API_TOKEN found: {self.api_token[:10]}...")

        # Initialize HTTP client with auth headers
        self.client = HTTPClient(
            headers={
                "Authorization": f"Bearer {self.api_token}",
                "Content-Type": "application/json",
            }
        )

    def delete_machine(self, app_name: str, machine_id: str) -> bool:
        """Delete a machine"""
        url = f"{self.machines_base}/apps/{app_name}/machines/{machine_id}?force=true"
        response = self.client.delete(url)

        if not response:
            return False

        if response.status_code in [200, 204, 404]:
            print(f"✓ Deleted machine {machine_id}")
            return True

        print(f"✗ Failed to delete machine: {response.status_code}")
        return False

    def list_machines(self, app_name: str) -> List[Machine]:
        """List all machines for an app"""
        url = f"{self.machines_base}/apps/{app_name}/machines"
        response = self.client.get(url)

        if not is_success(response):
            if response:
                print(f"Failed to list machines: {response.text}")
            return []

        # Parse each machine into a Machine model
        machines_data = parse_json(response) or []
        machines = []

        if not isinstance(machines_data, list):
            print("Expected list of machines")
            return []

        for data in machines_data:
            try:
                machine = Machine.model_validate(data)
                machines.append(machine)
                print(f"  - ID: {machine.id}")
                print(f"    State: {machine.state}")
                print(f"    Region: {machine.region}")
            except Exception as e:
                print(f"Failed to parse machine: {e}")

        return machines

    def start_machine(self, app_name: str, machine_id: str) -> bool:
        """Start a specific machine"""
        url = f"{self.machines_base}/apps/{app_name}/machines/{machine_id}/start"
        response = self.client.post(url)

        if not response:
            return False

        if is_success(response):
            print(f"✓ Started machine {machine_id}")
            return True

        print(f"Failed to start machine: {response.text}")
        return False

    def delete_app(self, app_name: str) -> bool:
        """Delete a Fly.io app and all its machines"""
        # Delete all machines first
        machines = self.list_machines(app_name)
        for machine in machines:
            if not self.delete_machine(app_name, machine.id):
                print(f"Failed to delete machine {machine.id}")

        # Delete the app itself
        url = f"{self.api_base}/apps/{app_name}"
        response = self.client.delete(url)

        if not response:
            return False

        if response.status_code in [202, 204, 404]:
            print(f"✓ App {app_name} deleted")
            return True

        print(f"✗ Failed to delete app: {response.status_code}")
        return False

    def create_app(self, app_name: str) -> Optional[AppInfo]:
        """Create a new Fly.io app using REST API"""
        print(f"Creating app '{app_name}'...")

        # Create request using model
        request = CreateAppRequest(app_name=app_name)
        url = f"{self.api_base}/apps"

        response = self.client.post(url, json=request.model_dump())

        if not is_success(response):
            if response:
                print(f"Failed to create app: {response.status_code} - {response.text}")
            return None

        # Parse response - we need the raw data to construct AppInfo
        app_data = parse_json(response)
        if not app_data or not isinstance(app_data, dict):
            return None

        app_info = AppInfo(
            name=app_data.get("name") or app_name,  # Ensure name is never None
            hostname=f"{app_name}.fly.dev",
        )

        print(f"App created successfully: {app_info.hostname}")

        # Allocate IPs
        print(f"Allocating IPs for {app_name}...")
        self._allocate_ips(app_name)

        return app_info

    def _allocate_ips(self, app_name: str) -> bool:
        """Allocate IPv4 and IPv6 addresses for the app"""
        url = f"{self.api_base}/apps/{app_name}/ip_addresses"

        # Allocate shared IPv4
        request = AllocateIPRequest(type=IPAddressType.SHARED_V4)
        response = self.client.post(url, json=request.model_dump())
        if is_success(response):
            print("✓ Shared IPv4 allocated")
        else:
            print("Failed to allocate IPv4")

        # Allocate IPv6
        request = AllocateIPRequest(type=IPAddressType.V6)
        response = self.client.post(url, json=request.model_dump())
        if is_success(response):
            print("✓ IPv6 allocated")
        else:
            print("Failed to allocate IPv6")

        return True

    def get_app_status(self, app_name: str) -> Optional[AppStatusModel]:
        """Check if an app exists and get its status"""
        url = f"{self.api_base}/apps/{app_name}"
        response = self.client.get(url)

        if not response:
            return None

        if response.status_code == 404:
            print(f"App {app_name} not found")
            return None

        if not is_success(response):
            print(f"Failed to get app status: {response.status_code}")
            return None

        app_data = parse_json(response)
        if not app_data or not isinstance(app_data, dict):
            return None

        # Get machines info to check deployment status
        machines = self.list_machines(app_name)
        deployed = any(m.state == MachineState.STARTED for m in machines)

        return AppStatusModel(
            id=app_data.get("id"),
            name=app_data.get("name") or app_name,  # Ensure name is never None
            hostname=app_data.get("hostname", f"{app_name}.fly.dev"),
            status=app_data.get("status", "unknown"),
            deployed=deployed,
            machines=machines,
        )

    def deploy_to_app(self, app_name: str) -> bool:
        """Deploy a machine to the app"""
        print(f"=== STARTING DEPLOYMENT FOR {app_name} ===")

        # Small delay to ensure app is ready
        time.sleep(2)

        # Create machine
        machine_id = self._create_machine(app_name)
        if not machine_id:
            return False

        # Wait for initialization
        time.sleep(3)

        # Ensure machine is started
        if not self._ensure_machine_started(app_name, machine_id):
            return False

        print("=== DEPLOYMENT COMPLETE ===")
        return True

    def _create_machine(self, app_name: str) -> Optional[str]:
        """Create a machine with the default config"""
        url = f"{self.machines_base}/apps/{app_name}/machines"

        # Use the model's default config method
        request = CreateMachineRequest.default_config(app_name)

        print("Creating machine...")
        response = self.client.post(url, json=request.model_dump(), timeout=60.0)

        if not response:
            return None

        if response.status_code == 422:
            print(f"422 Error details: {response.text}")
            return None

        if not is_success(response):
            print(f"✗ Failed with status {response.status_code}")
            print(f"Response body: {response.text}")
            return None

        machine_data = parse_json(response)
        if not machine_data or not isinstance(machine_data, dict):
            return None

        machine_id = machine_data.get("id")
        if not machine_id:
            print("No machine ID in response")
            return None

        print(f"✓ Machine created with ID: {machine_id}")

        return machine_id

    def _ensure_machine_started(self, app_name: str, machine_id: str) -> bool:
        """Ensure a machine is in started state"""
        machines = self.list_machines(app_name)
        machine = next((m for m in machines if m.id == machine_id), None)

        if not machine:
            print(f"Machine {machine_id} not found")
            return False

        if machine.state == MachineState.STARTED:
            return True

        print(f"Machine is in state: {machine.state}, starting it...")
        return self.start_machine(app_name, machine_id)
