#!/usr/bin/env python3
"""
Test script to debug Fly.io API issues
Run with: python test_fly.py
"""

import json
import os
import sys
import time

import httpx
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get API token
FLY_API_TOKEN = os.getenv("FLY_API_TOKEN")
if not FLY_API_TOKEN:
    print("ERROR: FLY_API_TOKEN not found in environment")
    sys.exit(1)

print(f"Using token: {FLY_API_TOKEN[:10]}...")

# Set up headers
headers = {
    "Authorization": f"Bearer {FLY_API_TOKEN}",
    "Content-Type": "application/json",
}

API_BASE = "https://api.machines.dev/v1"


def test_auth():
    """Test if auth works"""
    print("\n1. Testing authentication...")
    # Need to provide org_slug parameter
    response = httpx.get(f"{API_BASE}/apps?org_slug=personal", headers=headers)

    if response.status_code == 200:
        print("✓ Authentication successful")
        data = response.json()
        apps = data.get("apps", [])
        print(f"  Found {len(apps)} existing apps")
        return True
    else:
        print(f"✗ Authentication failed: {response.status_code}")
        print(f"  Response: {response.text}")
        return False


def create_test_app(app_name):
    """Create a test app"""
    print(f"\n2. Creating app '{app_name}'...")

    data = {"app_name": app_name, "org_slug": "personal"}

    response = httpx.post(f"{API_BASE}/apps", json=data, headers=headers)

    if response.status_code in [200, 201]:
        print("✓ App created successfully")
        app_data = response.json()
        print(f"  Full response: {json.dumps(app_data, indent=2)}")

        app_id = app_data.get("id")
        actual_name = app_data.get(
            "name", app_name
        )  # Use requested name if none returned

        print(f"  App ID: {app_id}")
        print(f"  App Name: {actual_name}")

        # Wait a bit for app to propagate
        print("  Waiting 5 seconds for app to propagate...")
        time.sleep(5)

        # Verify app exists
        verify_response = httpx.get(f"{API_BASE}/apps/{actual_name}", headers=headers)
        if verify_response.status_code == 200:
            print("  ✓ App verified via REST API")
            verified_data = verify_response.json()
            print(f"  Verified app data: {json.dumps(verified_data, indent=2)}")
        else:
            print(
                f"  ✗ Could not verify app via REST API: {verify_response.status_code}"
            )

        return {"id": app_id, "name": actual_name, "requested_name": app_name}
    else:
        print(f"✗ Failed to create app: {response.status_code}")
        print(f"  Response: {response.text}")
        return None


def get_app_via_graphql(app_name):
    """Try to get app info via GraphQL"""
    print(f"\n  Checking app '{app_name}' via GraphQL...")

    query = """
    query($appName: String!) {
        app(name: $appName) {
            id
            name
            hostname
            ipAddresses {
                nodes {
                    id
                    address
                    type
                }
            }
        }
    }
    """

    response = httpx.post(
        "https://api.fly.io/graphql",
        json={"query": query, "variables": {"appName": app_name}},
        headers=headers,
    )

    if response.status_code == 200:
        data = response.json()
        print(f"  GraphQL response: {json.dumps(data, indent=2)}")

        app_data = data.get("data", {}).get("app")
        if app_data:
            print("  ✓ Found app via GraphQL")
            print(f"    GraphQL ID: {app_data.get('id')}")
            print(f"    Name: {app_data.get('name')}")
            print(f"    Hostname: {app_data.get('hostname')}")
            return app_data
        else:
            print("  ✗ App not found via GraphQL")
            return None
    else:
        print(f"  ✗ GraphQL request failed: {response.status_code}")
        return None


def allocate_ip(app_identifier, ip_type="shared_v4", use_name=False):
    """Allocate IP using GraphQL API"""
    identifier_type = "name" if use_name else "ID"
    print(f"\n  Allocating {ip_type} for app {identifier_type}: {app_identifier}...")

    # GraphQL endpoint
    graphql_url = "https://api.fly.io/graphql"

    # GraphQL mutation to allocate IP
    mutation = """
    mutation($appId: ID!, $type: IPAddressType!) {
        allocateIpAddress(input: {appId: $appId, type: $type}) {
            ipAddress {
                id
                address
                type
            }
        }
    }
    """

    # Allocate IP
    response = httpx.post(
        graphql_url,
        json={
            "query": mutation,
            "variables": {"appId": app_identifier, "type": ip_type},
        },
        headers=headers,
    )

    if response.status_code == 200:
        try:
            data = response.json()
        except json.JSONDecodeError:
            print("  ✗ Failed to parse JSON response")
            print(f"    Response: {response.text}")
            return False

        # Debug print the full response
        print(f"  GraphQL Response: {json.dumps(data, indent=2)}")

        # Check for errors first
        errors = data.get("errors", [])
        if errors:
            for error in errors:
                print(f"  ✗ GraphQL error: {error.get('message', 'Unknown error')}")
            return False

        # Try to get the data
        response_data = data.get("data", {})
        allocate_result = response_data.get("allocateIpAddress", {})
        ip_info = allocate_result.get("ipAddress") if allocate_result else None

        if ip_info:
            print(f"  ✓ {ip_type} allocated: {ip_info.get('address')}")
            return True
        else:
            print(f"  ✗ Failed to allocate {ip_type}: No IP returned")
            return False
    else:
        print(f"  ✗ Failed to allocate {ip_type}: {response.status_code}")
        print(f"    Response: {response.text}")
        return False


def create_machine(app_name):
    """Create a machine"""
    print(f"\n4. Creating machine for '{app_name}'...")

    config = {
        "region": "ord",
        "config": {
            "image": "nginx:alpine",
            "services": [
                {
                    "protocol": "tcp",
                    "internal_port": 80,
                    "auto_stop_machines": True,
                    "auto_start_machines": True,
                    "min_machines_running": 0,
                    "ports": [
                        {"port": 80, "handlers": ["http"], "force_https": True},
                        {"port": 443, "handlers": ["tls", "http"]},
                    ],
                }
            ],
            "guest": {"cpu_kind": "shared", "cpus": 1, "memory_mb": 256},
        },
    }

    response = httpx.post(
        f"{API_BASE}/apps/{app_name}/machines", json=config, headers=headers
    )

    if response.status_code in [200, 201]:
        print("✓ Machine created successfully")
        machine = response.json()
        machine_id = machine.get("id")
        print(f"  Machine ID: {machine_id}")
        print(f"  Initial state: {machine.get('state')}")

        # Wait for machine to start
        print("  Waiting for machine to start...")
        for i in range(30):
            response = httpx.get(
                f"{API_BASE}/apps/{app_name}/machines/{machine_id}", headers=headers
            )
            if response.status_code == 200:
                state = response.json().get("state")
                if state == "started":
                    print(f"  ✓ Machine started after {i + 1} seconds")
                    break
                elif state in ["stopped", "failed", "destroyed"]:
                    print(f"  ✗ Machine failed to start: {state}")
                    break
            time.sleep(1)

        return machine
    else:
        print(f"✗ Failed to create machine: {response.status_code}")
        print(f"  Response: {response.text}")
        return None


def check_app_ips(app_name):
    """Check what IPs are allocated to the app"""
    print(f"\n6. Checking IPs for '{app_name}'...")

    query = """
    query($appName: String!) {
        app(name: $appName) {
            ipAddresses {
                nodes {
                    id
                    address
                    type
                }
            }
        }
    }
    """

    response = httpx.post(
        "https://api.fly.io/graphql",
        json={"query": query, "variables": {"appName": app_name}},
        headers=headers,
    )

    if response.status_code == 200:
        try:
            data = response.json()
            app_data = data.get("data", {}).get("app", {})
            if app_data:
                ip_addresses = app_data.get("ipAddresses", {})
                ips = ip_addresses.get("nodes", []) if ip_addresses else []
                if ips:
                    print("  Allocated IPs:")
                    for ip in ips:
                        print(f"    - {ip['address']} ({ip['type']})")
                else:
                    print("  ✗ No IPs allocated")
            else:
                print("  ✗ App not found or no data returned")
        except Exception as e:
            print(f"  ✗ Error parsing response: {e}")
            print(f"    Response: {response.text}")
    else:
        print(f"  Failed to check IPs: {response.status_code}")


def wait_for_deployment(app_name, machine_id, timeout=60):
    """Wait for machine to be fully deployed"""
    print("\n5. Waiting for deployment to complete...")

    for i in range(timeout):
        response = httpx.get(
            f"{API_BASE}/apps/{app_name}/machines/{machine_id}", headers=headers
        )
        if response.status_code == 200:
            machine_data = response.json()
            state = machine_data.get("state")

            # Check if instance ID is assigned (indicates deployment)
            instance_id = machine_data.get("instance_id")
            if state == "started" and instance_id:
                print(f"  ✓ Deployment complete after {i + 1} seconds")
                print(f"  Instance ID: {instance_id}")
                return True

        time.sleep(1)

    print(f"  ✗ Deployment did not complete after {timeout} seconds")
    return False


def check_dns(hostname):
    """Check if DNS resolves"""
    print(f"\n7. Checking DNS for {hostname}...")

    import socket

    for i in range(30):  # Try for 90 seconds
        try:
            ip = socket.gethostbyname(hostname)
            print(f"✓ DNS resolved to {ip} after {i * 3} seconds")
            return True
        except socket.gaierror:
            if i % 5 == 0:  # Print every 15 seconds
                print(f"  Waiting for DNS... ({i + 1}/30)")
            time.sleep(3)

    print("✗ DNS did not resolve after 90 seconds")

    # Try to debug why
    print("\n  Debugging DNS issue:")
    try:
        # Check if we can resolve fly.io itself
        socket.gethostbyname("fly.io")
        print("  ✓ Can resolve fly.io - DNS is working")
    except:
        print("  ✗ Cannot resolve fly.io - DNS issue on this machine")

    return False


def cleanup_app(app_name):
    """Delete the test app"""
    print(f"\n9. Cleaning up app '{app_name}'...")

    response = httpx.delete(f"{API_BASE}/apps/{app_name}", headers=headers)

    if response.status_code in [202, 204, 404]:
        print("✓ App deleted successfully")
    else:
        print(f"✗ Failed to delete app: {response.status_code}")


def main():
    """Run all tests"""
    print("=== FLY.IO API TEST ===")

    # Test auth
    if not test_auth():
        return

    # Generate test app name
    app_name = f"test-{int(time.time())}"
    actual_app_name = app_name  # Default to requested name

    try:
        # Create app
        app_info = create_test_app(app_name)
        if not app_info:
            return

        app_id = app_info["id"]
        actual_app_name = app_info["name"]

        # Check app via GraphQL
        graphql_app = get_app_via_graphql(actual_app_name)

        # Determine which ID to use for IP allocation
        graphql_id = None
        if graphql_app:
            graphql_id = graphql_app.get("id")
            print(f"\n  Note: REST API ID ({app_id}) vs GraphQL ID ({graphql_id})")

        # Try to allocate IPs
        print("\n3. Allocating IPs...")
        print("  Note: IP allocation might fail if the app already has IPs")

        # Try with GraphQL ID if we have it
        if graphql_id:
            print("  Trying with GraphQL ID first...")
            ipv4_allocated = allocate_ip(graphql_id, "shared_v4")
            ipv6_allocated = allocate_ip(graphql_id, "v6")
        else:
            # Try with app name
            print("  Trying with app name...")
            ipv4_allocated = allocate_ip(actual_app_name, "shared_v4", use_name=True)
            ipv6_allocated = allocate_ip(actual_app_name, "v6", use_name=True)

        if ipv4_allocated or ipv6_allocated:
            # Wait longer for IP to propagate
            print("\n  Waiting 20 seconds for IP to propagate...")
            time.sleep(20)
        else:
            print("\n  Continuing without IP allocation...")
            print(
                "  Note: Apps created via Machines API might get IPs automatically when machines are deployed"
            )

        # Create machine
        machine = create_machine(actual_app_name)
        if not machine:
            return

        machine_id = machine.get("id")

        # Wait for deployment
        wait_for_deployment(actual_app_name, machine_id)

        # Check allocated IPs
        check_app_ips(actual_app_name)

        # Check DNS
        hostname = f"{actual_app_name}.fly.dev"
        check_dns(hostname)

        # Test HTTP
        print("\n8. Testing HTTP access...")
        for url in [f"https://{hostname}", f"http://{hostname}"]:
            print(f"  Trying {url}...")
            try:
                response = httpx.get(url, timeout=10, follow_redirects=True)
                print(f"  ✓ Response: {response.status_code}")
                if response.status_code >= 200 and response.status_code < 500:
                    print("  App is accessible!")
                    break
            except httpx.ConnectError as e:
                print(f"  ✗ Connection failed: {e}")
            except Exception as e:
                print(f"  ✗ Failed: {type(e).__name__}: {e}")

    finally:
        # Always cleanup
        cleanup_app(actual_app_name)

    print("\n=== TEST COMPLETE ===")


if __name__ == "__main__":
    main()
