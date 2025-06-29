"""
Deployment operations for Fly.io apps with hibernation support.
"""

import time

import httpx

from fly.client import FlyClient
from fly.queries import (
    ALLOCATE_IP_ADDRESS,
    ALLOCATE_SHARED_IP,
    CREATE_APP,
    DELETE_APP,
    GET_APP,
    GET_ORGANIZATION,
)


def get_organization_id(client: FlyClient, org_slug: str = "personal") -> str:
    """Get organization ID from slug."""
    result = client.execute_graphql(GET_ORGANIZATION)
    if "errors" in result:
        raise Exception(f"Failed to get organizations: {result['errors']}")

    orgs = result["data"]["viewer"]["organizations"]["nodes"]

    # Find the organization by slug
    for org in orgs:
        if org["slug"] == org_slug:
            return org["id"]

    # If not found and looking for personal, use the first org
    if org_slug == "personal" and orgs:
        return orgs[0]["id"]

    raise Exception(f"Organization '{org_slug}' not found")


def create_app(client: FlyClient, app_name: str, org_id: str) -> dict:
    """Create a new Fly.io app."""
    variables = {
        "input": {
            "name": app_name,
            "organizationId": org_id,
        }
    }

    result = client.execute_graphql(CREATE_APP, variables)
    if "errors" in result:
        raise Exception(f"Failed to create app: {result['errors']}")

    return result["data"]["createApp"]["app"]


def allocate_ips(client: FlyClient, app_name: str) -> tuple[str, str]:
    """Allocate IPv4 and IPv6 addresses for the app."""
    # Allocate shared IPv4
    ipv4_variables = {"input": {"appId": app_name, "type": "shared_v4", "region": ""}}

    ipv4_result = client.execute_graphql(ALLOCATE_SHARED_IP, ipv4_variables)
    if "errors" in ipv4_result:
        raise Exception(f"Failed to allocate IPv4: {ipv4_result['errors']}")

    shared_ip = ipv4_result["data"]["allocateIpAddress"]["app"]["sharedIpAddress"]

    # Allocate dedicated IPv6
    ipv6_variables = {"input": {"appId": app_name, "type": "v6", "region": ""}}

    ipv6_result = client.execute_graphql(ALLOCATE_IP_ADDRESS, ipv6_variables)
    if "errors" in ipv6_result:
        raise Exception(f"Failed to allocate IPv6: {ipv6_result['errors']}")

    ipv6_address = ipv6_result["data"]["allocateIpAddress"]["ipAddress"]["address"]

    return shared_ip, ipv6_address


def delete_app(client: FlyClient, app_name: str) -> bool:
    """Delete a Fly.io app."""
    # Guard clause for empty app name
    if not app_name:
        print("Error: app_name is empty or None")
        return False

    # First get the app to verify it exists and get its ID
    get_variables = {"appName": app_name}
    get_result = client.execute_graphql(GET_APP, get_variables)

    if "errors" in get_result:
        print(f"Error getting app: {get_result['errors']}")
        return False

    if not get_result.get("data", {}).get("app"):
        print(f"App {app_name} not found")
        return False

    app_id = get_result["data"]["app"]["id"]

    # Now delete using the ID
    delete_variables = {"appId": app_id}
    delete_result = client.execute_graphql(DELETE_APP, delete_variables)

    if "errors" in delete_result:
        raise Exception(f"Failed to delete app: {delete_result['errors']}")

    return True


def delete_app_force(client: FlyClient, app_name: str) -> dict:
    """Delete a Fly.io app using REST API with force (stops machines first)."""
    # Guard clause for empty app name
    if not app_name:
        return {"success": False, "error": "App name is empty or None", "status_code": 400}

    return client.delete_app_rest(app_name, force=True)


def list_all_apps(client: FlyClient, org_slug: str = "personal") -> list[dict]:
    """List all apps in the organization."""
    return client.list_apps(org_slug)


def delete_all_apps_in_org(client: FlyClient, org_slug: str = "personal") -> dict:
    """Delete ALL apps in the organization. Use with caution!"""
    apps = list_all_apps(client, org_slug)

    if not apps:
        return {"deleted": 0, "failed": 0, "total": 0, "apps": []}

    print(f"Found {len(apps)} apps in organization '{org_slug}'")

    deleted_count = 0
    failed_count = 0
    deleted_apps = []
    failed_apps = []

    for app in apps:
        app_name = app["name"]
        print(f"Force deleting app: {app_name}")

        if _try_delete_app(client, app_name):
            deleted_count += 1
            deleted_apps.append(app_name)
            print(f"✓ Deleted: {app_name}")
        else:
            failed_count += 1
            failed_apps.append(app_name)
            print(f"✗ Failed to delete: {app_name}")

    return {
        "deleted": deleted_count,
        "failed": failed_count,
        "total": len(apps),
        "deleted_apps": deleted_apps,
        "failed_apps": failed_apps,
    }


def _try_delete_app(client: FlyClient, app_name: str) -> bool:
    """Try to delete a single app, return success status."""
    try:
        result = delete_app_force(client, app_name)
        return result.get("success", False)
    except Exception as e:
        print(f"✗ Error deleting {app_name}: {str(e)}")
        return False


def get_app_status(client: FlyClient, app_name: str) -> dict | None:
    """Get app status and details."""
    if not app_name:
        return None

    variables = {"appName": app_name}
    result = client.execute_graphql(GET_APP, variables)

    if "errors" in result:
        return None

    return result.get("data", {}).get("app")


def create_and_deploy_machine(
    client: FlyClient,
    app_name: str,
    image: str = "flyio/hellofly:latest",
    region: str = "ewr",
    idle_timeout_minutes: int = 5,
) -> str:
    """Create and deploy a machine to the app with hibernation enabled.

    Args:
        client: Fly.io API client
        app_name: Name of the app to deploy to
        image: Docker image to deploy
        region: Region to deploy in
        idle_timeout_minutes: Minutes of inactivity before hibernation (default: 5)

    Returns:
        Machine ID
    """
    # Convert minutes to the format Fly.io expects
    if idle_timeout_minutes < 60:
        idle_timeout = f"{idle_timeout_minutes}m"
    else:
        hours = idle_timeout_minutes // 60
        minutes = idle_timeout_minutes % 60
        idle_timeout = f"{hours}h{minutes}m" if minutes else f"{hours}h"

    config = {
        "image": image,
        "guest": {"cpu_kind": "shared", "cpus": 1, "memory_mb": 256},
        "services": [
            {
                "ports": [
                    {"port": 80, "handlers": ["http"], "force_https": True},
                    {"port": 443, "handlers": ["http", "tls"]},
                ],
                "protocol": "tcp",
                "internal_port": 8080,
                "autostop": "stop",
                "autostart": True,
                "min_machines_running": 0,
                "checks": [
                    {
                        "type": "http",
                        "port": 8080,
                        "path": "/health",
                        "interval": "15s",
                        "timeout": "10s",
                    }
                ],
            }
        ],
        "auto_destroy": False,
        "restart": {"policy": "on-failure", "max_retries": 1},
        "stop": {
            "timeout": idle_timeout,
            "signal": "SIGTERM",
        },
    }

    machine = client.create_machine(app_name, config, region)
    return machine["id"]


def wait_for_app_ready(client: FlyClient, app_name: str, timeout: int = 60) -> bool:
    """Wait for app to be ready with DNS propagation."""
    start_time = time.time()

    while time.time() - start_time < timeout:
        status = get_app_status(client, app_name)
        if status and status.get("hostname"):
            print(f"App hostname available: {status['hostname']}")
            time.sleep(10)  # DNS can take 5-10 seconds
            return True
        time.sleep(3)

    return False


def stop_machine(client: FlyClient, app_name: str, machine_id: str) -> bool:
    """Manually stop a machine (for testing hibernation)."""
    url = f"{client.machines_url}/apps/{app_name}/machines/{machine_id}/stop"

    with httpx.Client() as http:
        response = http.post(url, headers=client.headers, timeout=30.0)
        return response.status_code == 200


def start_machine(client: FlyClient, app_name: str, machine_id: str) -> bool:
    """Manually start a machine (for testing wake-up)."""
    url = f"{client.machines_url}/apps/{app_name}/machines/{machine_id}/start"

    with httpx.Client() as http:
        response = http.post(url, headers=client.headers, timeout=30.0)
        return response.status_code == 200


def get_machine_status(client: FlyClient, app_name: str, machine_id: str) -> dict:
    """Get current status of a machine."""
    machine = client.get_machine(app_name, machine_id)
    return {
        "state": machine.get("state"),
        "created_at": machine.get("created_at"),
        "updated_at": machine.get("updated_at"),
        "config": machine.get("config", {}),
        "checks": machine.get("checks", []),
    }


def list_machines(client: FlyClient, app_name: str) -> list[dict]:
    """List all machines for an app."""
    url = f"{client.machines_url}/apps/{app_name}/machines"

    with httpx.Client() as http:
        response = http.get(url, headers=client.headers, timeout=30.0)
        response.raise_for_status()
        return response.json()


def get_machine_events(client: FlyClient, app_name: str, machine_id: str) -> list[dict]:
    """Get recent events for a machine (useful for debugging hibernation)."""
    url = f"{client.machines_url}/apps/{app_name}/machines/{machine_id}/events"

    with httpx.Client() as http:
        response = http.get(url, headers=client.headers, timeout=30.0)
        if response.status_code == 200:
            return response.json()
        return []
