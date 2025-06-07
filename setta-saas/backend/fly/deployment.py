"""
Deployment operations for Fly.io apps.
"""

import time

from fly.client import FlyClient
from fly.queries import (
    ALLOCATE_IP_ADDRESS,
    ALLOCATE_SHARED_IP,
    CREATE_APP,
    DELETE_APP,
    GET_APP,
)


def create_app(client: FlyClient, app_name: str, org_slug: str) -> dict:
    """Create a new Fly.io app."""
    variables = {
        "input": {
            "name": app_name,
            "organizationId": org_slug,
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
    # First get the app to get its ID
    get_variables = {"appName": app_name}
    get_result = client.execute_graphql(GET_APP, get_variables)

    if "errors" in get_result or not get_result.get("data", {}).get("app"):
        return False

    app_id = get_result["data"]["app"]["id"]

    # Now delete using the ID
    delete_variables = {"appId": app_id}
    delete_result = client.execute_graphql(DELETE_APP, delete_variables)

    if "errors" in delete_result:
        raise Exception(f"Failed to delete app: {delete_result['errors']}")

    return True


def get_app_status(client: FlyClient, app_name: str) -> dict | None:
    """Get app status and details."""
    variables = {"appName": app_name}
    result = client.execute_graphql(GET_APP, variables)

    if "errors" in result:
        return None

    return result.get("data", {}).get("app")


def create_and_deploy_machine(
    client: FlyClient, app_name: str, image: str = "flyio/hellofly:latest", region: str = "ewr"
) -> str:
    """Create and deploy a machine to the app."""
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
            }
        ],
    }

    machine = client.create_machine(app_name, config, region)
    return machine["id"]


def wait_for_app_ready(client: FlyClient, app_name: str, timeout: int = 60) -> bool:
    """Wait for app to be ready with DNS propagation."""
    start_time = time.time()

    while time.time() - start_time < timeout:
        status = get_app_status(client, app_name)
        if status and status.get("deployed"):
            # Give DNS a bit more time to propagate
            time.sleep(5)
            return True
        time.sleep(2)

    return False
