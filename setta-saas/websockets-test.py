"""
Test script to monitor project events through WebSocket in real-time.
Run this while creating/deleting projects to see the events.
"""

import asyncio
import json
import sys
from datetime import datetime

import aiohttp


async def listen_for_project_events():
    # Use your actual backend URL
    ws_uri = "wss://backend-production-6fbb.up.railway.app/ws"
    api_url = "https://backend-production-6fbb.up.railway.app"

    try:
        print(f"[{datetime.now().strftime('%H:%M:%S')}] Connecting to WebSocket...")

        async with websockets.connect(ws_uri) as websocket:
            print(f"[{datetime.now().strftime('%H:%M:%S')}] ✓ Connected!")
            print(
                f"[{datetime.now().strftime('%H:%M:%S')}] Listening for project events...\n"
            )
            print("=" * 60)
            print("Try these actions in another terminal or browser:")
            print("1. Create a project")
            print("2. Delete a project")
            print("3. Check project status")
            print("=" * 60)
            print()

            while True:
                try:
                    message = await websocket.recv()
                    data = json.loads(message)

                    # Format the event nicely
                    event_type = data.get("type", "unknown")
                    timestamp = datetime.now().strftime("%H:%M:%S")

                    # Color-code different event types
                    if "error" in event_type:
                        print(f"[{timestamp}] 🔴 {event_type}")
                    elif "ready" in event_type or "created" in event_type:
                        print(f"[{timestamp}] 🟢 {event_type}")
                    elif "creating" in event_type or "deploying" in event_type:
                        print(f"[{timestamp}] 🟡 {event_type}")
                    elif "deleted" in event_type:
                        print(f"[{timestamp}] 🔵 {event_type}")
                    elif "progress" in event_type:
                        print(f"[{timestamp}] ⏳ {event_type}")
                    else:
                        print(f"[{timestamp}] ⚪ {event_type}")

                    # Print event details
                    if "data" in data:
                        event_data = data["data"]
                        if isinstance(event_data, dict):
                            for key, value in event_data.items():
                                if key != "timestamp":  # Skip duplicate timestamp
                                    print(f"    {key}: {value}")

                    print("-" * 40)

                except json.JSONDecodeError as e:
                    print(f"[{timestamp}] Failed to parse message: {e}")
                except Exception as e:
                    print(f"[{timestamp}] Error: {e}")

    except KeyboardInterrupt:
        print("\n\nStopped listening for events.")
    except Exception as e:
        print(f"Connection failed: {e}")


async def create_test_project(project_name):
    """Helper function to create a test project via API"""
    api_url = "https://backend-production-6fbb.up.railway.app/api/projects"

    async with aiohttp.ClientSession() as session:
        payload = {"name": project_name}
        async with session.post(api_url, json=payload) as response:
            if response.status == 200:
                data = await response.json()
                print(f"\n✓ Created project: {data['name']} (ID: {data['id']})\n")
                return data["id"]
            else:
                print(f"\n✗ Failed to create project: {response.status}\n")
                return None


async def delete_test_project(project_id):
    """Helper function to delete a test project via API"""
    api_url = (
        f"https://backend-production-6fbb.up.railway.app/api/projects/{project_id}"
    )

    async with aiohttp.ClientSession() as session:
        async with session.delete(api_url) as response:
            if response.status == 200:
                print(f"\n✓ Deleted project: {project_id}\n")
            else:
                print(f"\n✗ Failed to delete project: {response.status}\n")


async def main():
    print("WebSocket Project Events Monitor")
    print("=" * 60)
    print("Options:")
    print("1. Listen for events only")
    print("2. Create a test project and listen")
    print("3. Run automated test (create, wait, delete)")
    print()

    choice = input("Select option (1-3): ").strip()

    if choice == "1":
        await listen_for_project_events()

    elif choice == "2":
        # Start listening in background
        listen_task = asyncio.create_task(listen_for_project_events())

        # Wait a bit for connection
        await asyncio.sleep(2)

        # Create a test project
        project_name = f"websocket-test-{int(datetime.now().timestamp())}"
        await create_test_project(project_name)

        # Keep listening
        await listen_task

    elif choice == "3":
        # Start listening in background
        listen_task = asyncio.create_task(listen_for_project_events())

        # Wait for connection
        await asyncio.sleep(2)

        # Create a test project
        project_name = f"auto-test-{int(datetime.now().timestamp())}"
        print(f"\nCreating project: {project_name}")
        project_id = await create_test_project(project_name)

        if project_id:
            # Wait to see deployment events
            print("Waiting 30 seconds to observe deployment events...")
            await asyncio.sleep(30)

            # Delete the project
            print(f"\nDeleting project: {project_id}")
            await delete_test_project(project_id)

            # Wait to see delete event
            await asyncio.sleep(5)

        # Cancel listening
        listen_task.cancel()
        print("\nTest completed!")

    else:
        print("Invalid option. Please run again and select 1-3.")


if __name__ == "__main__":
    try:
        import aiohttp
        import websockets
    except ImportError:
        print("Please install required packages:")
        print("pip install websockets aiohttp")
        sys.exit(1)

    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\nExiting...")
