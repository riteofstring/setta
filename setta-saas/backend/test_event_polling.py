"""
Test script to verify event polling during deployment.
Run this to create a test project and watch the real-time progress updates.
"""

import asyncio
import sys
from datetime import datetime

# Add parent directory to path
sys.path.append(".")

from config import get_settings
from services.deployment_events import DeploymentEventParser


def test_event_parser():
    """Test the event parser with sample events."""
    print("Testing Event Parser")
    print("=" * 50)

    parser = DeploymentEventParser()

    # Sample events that might come from Fly.io
    sample_events = [
        {"type": "start", "status": "in_progress", "timestamp": "2025-06-24T10:00:00Z"},
        {
            "type": "image_pull",
            "status": "pulling",
            "image": "flyio/hellofly:latest",
            "timestamp": "2025-06-24T10:00:05Z",
        },
        {
            "type": "image_pull",
            "status": "complete",
            "image": "flyio/hellofly:latest",
            "timestamp": "2025-06-24T10:00:15Z",
        },
        {"type": "container_create", "status": "creating", "timestamp": "2025-06-24T10:00:20Z"},
        {"type": "container_start", "status": "starting", "timestamp": "2025-06-24T10:00:25Z"},
        {"type": "health", "status": "checking", "attempt": 1, "timestamp": "2025-06-24T10:00:30Z"},
        {"type": "health", "status": "checking", "attempt": 2, "timestamp": "2025-06-24T10:00:35Z"},
        {"type": "health", "status": "passing", "attempt": 3, "timestamp": "2025-06-24T10:00:40Z"},
        {"type": "ready", "status": "complete", "timestamp": "2025-06-24T10:00:45Z"},
    ]

    for event in sample_events:
        result = parser.parse_event(event)
        if result:
            message, progress = result
            print(f"[{progress:3d}%] {message}")
        else:
            print(f"[Skip] Already processed or unknown event: {event.get('type')}")

    print("\nParser state:")
    print(f"  Events seen: {len(parser.seen_events)}")
    print(f"  Last progress: {parser.last_progress}%")


async def test_live_deployment():
    """Test with a real deployment (requires Fly.io API token)."""
    print("\n\nTesting Live Deployment")
    print("=" * 50)

    settings = get_settings()
    if not settings.fly_api_token:
        print("❌ No FLY_API_TOKEN found in environment")
        print("   Set it to test live deployment")
        return

    print("✓ Found Fly.io API token")
    print("\nWould you like to create a test project? (y/n): ", end="")

    if input().lower() != "y":
        print("Skipping live test")
        return

    from services.fly_service import FlyService

    # Create a test project
    project_id = f"test-{int(datetime.now().timestamp())}"
    app_name = f"event-poll-test-{int(datetime.now().timestamp())}"

    print(f"\nCreating test app: {app_name}")
    print("Watch for real-time progress updates...\n")

    # Progress callback to show updates
    async def show_progress(message: str, percent: int):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] [{percent:3d}%] {message}")

    try:
        service = FlyService()

        # Temporarily replace the broadcast method to use our print callback
        original_broadcast = service._broadcast_deployment_progress
        service._broadcast_deployment_progress = lambda proj_id, msg, pct: show_progress(msg, pct)

        # Run deployment
        result = await service.create_and_deploy_app_with_progress(app_name, project_id)

        print("\n✓ Deployment complete!")
        print(f"  URL: {result['url']}")
        print(f"  Machine ID: {result['machine_id']}")

        # Ask if user wants to delete
        print(f"\nDelete test app '{app_name}'? (y/n): ", end="")
        if input().lower() == "y":
            deleted = service.delete_app(app_name)
            if deleted:
                print("✓ Test app deleted")
            else:
                print("❌ Failed to delete test app")

        # Restore original method
        service._broadcast_deployment_progress = original_broadcast

    except Exception as e:
        print(f"\n❌ Deployment failed: {e}")


async def main():
    """Run all tests."""
    print("Event Polling Test Suite")
    print("=" * 70)
    print()

    # Test 1: Event parser
    test_event_parser()

    # Test 2: Live deployment (optional)
    await test_live_deployment()

    print("\n✓ Tests complete!")


if __name__ == "__main__":
    asyncio.run(main())
