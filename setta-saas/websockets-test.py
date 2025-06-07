"""
Quick script to test WebSocket connectivity to your Railway backend.
Run this locally to verify the connection works.
"""

import asyncio
import json
import sys

import websockets


async def test_websocket():
    # Use your actual backend URL
    uri = "wss://backend-production-6fbb.up.railway.app/ws"

    try:
        print(f"Connecting to {uri}...")

        async with websockets.connect(uri) as websocket:
            print("✓ Connected successfully!")

            # Wait for initial connection message
            message = await websocket.recv()
            data = json.loads(message)
            print(f"✓ Received: {data}")

            # Send a test message
            test_msg = {"type": "ping", "data": "test"}
            await websocket.send(json.dumps(test_msg))
            print(f"✓ Sent: {test_msg}")

            # Keep connection open for a bit to test stability
            print("\nListening for messages (Ctrl+C to stop)...")

            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=30.0)
                    data = json.loads(message)
                    print(f"Received: {data}")
                except asyncio.TimeoutError:
                    # Send periodic ping to keep connection alive
                    await websocket.send(json.dumps({"type": "ping"}))
                    print("Sent ping to keep connection alive")

    except websockets.exceptions.WebSocketException as e:
        print(f"✗ WebSocket error: {e}")
        return False
    except Exception as e:
        print(f"✗ Connection failed: {e}")
        return False

    return True


if __name__ == "__main__":
    print("WebSocket Connection Test")
    print("=" * 40)

    # Install: pip install websockets
    try:
        import websockets
    except ImportError:
        print("Please install websockets: pip install websockets")
        sys.exit(1)

    asyncio.run(test_websocket())
