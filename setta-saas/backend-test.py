"""
Test script to verify backend is broadcasting events properly.
This will create a project via API and monitor WebSocket events simultaneously.
"""

import asyncio
import json
from datetime import datetime

import aiohttp
import websockets


async def websocket_listener(uri):
    """Listen for WebSocket events"""
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Connecting to WebSocket...")

    events_received = []

    async with websockets.connect(uri) as websocket:
        print(
            f"[{datetime.now().strftime('%H:%M:%S')}] Connected! Listening for events..."
        )

        try:
            while True:
                message = await asyncio.wait_for(websocket.recv(), timeout=30.0)
                data = json.loads(message)
                timestamp = datetime.now().strftime("%H:%M:%S")
                print(f"[{timestamp}] Event received: {data['type']}")
                print(f"  Data: {json.dumps(data.get('data', {}), indent=2)}")
                events_received.append(data)

        except asyncio.TimeoutError:
            print(
                f"[{datetime.now().strftime('%H:%M:%S')}] No events received for 30 seconds"
            )

    return events_received


async def create_project_via_api(api_url, project_name):
    """Create a project through the API"""
    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Creating project: {project_name}")

    async with aiohttp.ClientSession() as session:
        payload = {"name": project_name}
        async with session.post(f"{api_url}/api/projects", json=payload) as response:
            if response.status == 200:
                data = await response.json()
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] Project created successfully!"
                )
                print(f"  ID: {data['id']}")
                print(f"  URL: {data['url']}")
                print(f"  Status: {data['status']}")
                return data
            else:
                print(
                    f"[{datetime.now().strftime('%H:%M:%S')}] Failed to create project: {response.status}"
                )
                return None


async def test_backend_events():
    # Configuration
    backend_url = "https://backend-production-6fbb.up.railway.app"
    ws_url = "wss://backend-production-6fbb.up.railway.app/ws"

    print("Backend Event Broadcasting Test")
    print("=" * 50)
    print(f"Backend URL: {backend_url}")
    print(f"WebSocket URL: {ws_url}")
    print()

    # Start WebSocket listener in background
    listener_task = asyncio.create_task(websocket_listener(ws_url))

    # Wait for connection
    await asyncio.sleep(2)

    # Create a test project
    project_name = f"event-test-{int(datetime.now().timestamp())}"
    project = await create_project_via_api(backend_url, project_name)

    if project:
        print(
            f"\n[{datetime.now().strftime('%H:%M:%S')}] Waiting 10 seconds for events..."
        )
        await asyncio.sleep(10)

    # Cancel listener
    listener_task.cancel()

    try:
        events = await listener_task
    except asyncio.CancelledError:
        events = []

    print(f"\n[{datetime.now().strftime('%H:%M:%S')}] Test completed!")
    print(f"Total events received: {len(events) if events else 0}")

    # Analyze events
    if events:
        event_types = [e.get("type") for e in events]
        print(f"Event types: {event_types}")

        project_events = [
            e for e in events if e.get("type") != "connection.established"
        ]
        if project_events:
            print(f"\nProject events received: {len(project_events)}")
            for event in project_events:
                print(f"  - {event.get('type')}")
        else:
            print("\n⚠️  NO PROJECT EVENTS RECEIVED!")
            print("This indicates the backend is not broadcasting events properly.")
    else:
        print("\n⚠️  NO EVENTS RECEIVED AT ALL!")


if __name__ == "__main__":
    print("Starting backend event test...")
    print("This will:")
    print("1. Connect to the WebSocket")
    print("2. Create a project via API")
    print("3. Monitor for WebSocket events")
    print()

    try:
        asyncio.run(test_backend_events())
    except KeyboardInterrupt:
        print("\nTest interrupted")
