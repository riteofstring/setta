"""
Script to check what events Fly.io actually returns during deployment.
Creates a test app and monitors all events from start to finish.
"""

import asyncio
import json
import sys
import time
from datetime import datetime

sys.path.append(".")

from config import get_settings
from fly.client import FlyClient
from fly.deployment import (
    allocate_ips,
    create_and_deploy_machine,
    create_app,
    delete_app_force,
    get_machine_events,
    get_organization_id,
    list_machines,
)


async def monitor_deployment_events():
    """Create a test deployment and monitor all events."""
    settings = get_settings()
    if not settings.fly_api_token:
        print("❌ No FLY_API_TOKEN found")
        return

    client = FlyClient(settings.fly_api_token)
    org_id = get_organization_id(client)

    # Generate test app name
    timestamp = int(datetime.now().timestamp())
    app_name = f"event-test-{timestamp}"

    print(f"Creating test app: {app_name}")
    print("=" * 80)

    all_events = []
    machine_id = None

    try:
        # Step 1: Create app
        print("\n[CREATING APP]")
        app = create_app(client, app_name, org_id)
        print(f"✓ App created: {app['hostname']}")

        # Step 2: Allocate IPs
        print("\n[ALLOCATING IPS]")
        ipv4, ipv6 = allocate_ips(client, app_name)
        print(f"✓ IPv4: {ipv4}, IPv6: {ipv6}")

        # Step 3: Create machine and start monitoring
        print("\n[CREATING MACHINE]")
        print("Starting deployment and event monitoring...")

        # Start machine creation in background
        machine_task = asyncio.create_task(
            asyncio.to_thread(create_and_deploy_machine, client, app_name)
        )

        # Poll for machine creation
        print("\nWaiting for machine to appear...")
        start_time = time.time()

        while not machine_id:
            # Check if machine task failed
            if machine_task.done():
                machine_id = await machine_task
                print(f"✓ Machine created: {machine_id}")
                break

            # Try to list machines
            machines = list_machines(client, app_name)
            if machines:
                machine_id = machines[0].get("id")
                print(f"✓ Found machine: {machine_id}")
                break

            # Timeout after 60 seconds
            if time.time() - start_time > 60:
                print("❌ Timeout waiting for machine")
                return

            await asyncio.sleep(1)

        # If machine task is still running, wait for it
        if not machine_task.done():
            machine_id = await machine_task

        # Step 4: Monitor events
        print("\n[MONITORING EVENTS]")
        print("Polling for events (60 seconds)...")

        seen_event_ids = set()
        poll_start = time.time()

        while time.time() - poll_start < 60:
            try:
                events = get_machine_events(client, app_name, machine_id)

                for event in events:
                    # Create unique event identifier
                    event_str = json.dumps(event, sort_keys=True)
                    event_hash = hash(event_str)

                    if event_hash not in seen_event_ids:
                        seen_event_ids.add(event_hash)
                        all_events.append(event)

                        # Print new event
                        elapsed = int(time.time() - poll_start)
                        print(f"\n[T+{elapsed}s] New Event:")
                        print(json.dumps(event, indent=2))

            except Exception as e:
                print(f"Error getting events: {e}")

            await asyncio.sleep(2)

        print("\n" + "=" * 80)
        print("MONITORING COMPLETE")
        print(f"Total events captured: {len(all_events)}")

        # Save events to file
        filename = f"fly_events_{app_name}.json"
        with open(filename, "w") as f:
            json.dump(
                {"app_name": app_name, "machine_id": machine_id, "events": all_events}, f, indent=2
            )
        print(f"Events saved to: {filename}")

        # Analyze event types
        print("\n[EVENT ANALYSIS]")
        event_types = {}
        for event in all_events:
            evt_type = event.get("type", "unknown")
            event_types[evt_type] = event_types.get(evt_type, 0) + 1

        print("Event type distribution:")
        for evt_type, count in sorted(event_types.items()):
            print(f"  {evt_type}: {count}")

    except Exception as e:
        print(f"\n❌ Error: {e}")

    finally:
        # Cleanup
        print("\n[CLEANUP]")
        print(f"Delete test app '{app_name}'? (y/n): ", end="")
        if input().lower() == "y":
            try:
                result = delete_app_force(client, app_name)
                if result.get("success"):
                    print("✓ App deleted")
                else:
                    print("❌ Failed to delete app")
            except Exception as e:
                print(f"❌ Error deleting app: {e}")


def main():
    print("Fly.io Event Discovery Tool")
    print("=" * 80)
    print("\nThis will:")
    print("1. Create a test Fly.io app")
    print("2. Deploy a machine")
    print("3. Monitor ALL events during the process")
    print("4. Save results to a JSON file")
    print("5. Clean up afterwards")

    print("\nContinue? (y/n): ", end="")

    if input().lower() != "y":
        print("Cancelled")
        return

    asyncio.run(monitor_deployment_events())


if __name__ == "__main__":
    main()
