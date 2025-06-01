#!/usr/bin/env python3
"""
Enhanced test script for Fly.io integration
Tests creation, deployment, IP allocation, and actual accessibility
"""

import time

import httpx
from app.fly_manager import FlyManager


def check_url_accessible(url: str, max_retries: int = 10) -> bool:
    """Check if a URL is accessible"""
    print(f"\nChecking if {url} is accessible...")

    for i in range(max_retries):
        try:
            response = httpx.get(url, timeout=5.0, follow_redirects=True)
            if response.status_code == 200:
                print(f"✓ URL is accessible! Status: {response.status_code}")
                return True
            else:
                print(f"  Attempt {i + 1}: Status {response.status_code}")
        except Exception as e:
            print(f"  Attempt {i + 1}: {type(e).__name__}")

        if i < max_retries - 1:
            time.sleep(3)

    print("✗ URL is not accessible after all retries")
    return False


def main():
    print("=== ENHANCED FLY.IO INTEGRATION TEST ===\n")

    # Initialize manager
    print("1. Initializing FlyManager...")
    try:
        fly = FlyManager()
        print("✓ FlyManager initialized successfully\n")
    except Exception as e:
        print(f"✗ Failed to initialize FlyManager: {e}")
        return

    # Test app name
    test_app_name = f"test-setta-{int(time.time())}"

    try:
        # Test 1: Create app
        print(f"2. Creating app '{test_app_name}'...")
        app_info = fly.create_app(test_app_name)

        if app_info:
            print("✓ App created successfully!")
            print(f"  - Name: {app_info.name}")
            print(f"  - Hostname: {app_info.hostname}")
            print(f"  - URL: https://{app_info.hostname}\n")
        else:
            print("✗ Failed to create app")
            return

        # Test 2: Deploy to app (includes IP allocation)
        print("3. Deploying to app (with IP allocation)...")
        success = fly.deploy_to_app(test_app_name)

        if success:
            print("✓ Deployment successful!\n")
        else:
            print("✗ Deployment failed\n")
            return

        # Test 3: Verify deployment status
        print("4. Verifying deployment status...")
        status = fly.get_app_status(test_app_name)

        if status and status.deployed:
            print(f"✓ App is deployed with {len(status.machines)} machine(s)")
            for i, machine in enumerate(status.machines):
                print(f"  - Machine {i + 1}: {machine.id} ({machine.state})")
        else:
            print("✗ App not deployed properly")
            return

        # Test 4: Check if app is actually accessible
        app_url = f"https://{app_info.hostname}"
        accessible = check_url_accessible(app_url)

        if accessible:
            print(f"\n✓ SUCCESS! App is live at: {app_url}")
            print("  The nginx default page should be visible")
        else:
            print(f"\n✗ FAILURE! App is not accessible at: {app_url}")
            print("  This means IP allocation or routing might have failed")

        # Give user time to check manually
        if accessible:
            print("\n5. App will remain live for 30 seconds...")
            print(f"   Visit {app_url} to see it!")
            for i in range(30, 0, -5):
                print(f"   {i} seconds remaining...", end="", flush=True)
                time.sleep(5)
            print()

    finally:
        # Cleanup
        print("\n6. Cleaning up - deleting test app...")
        try:
            if fly.delete_app(test_app_name):
                print("✓ Test app deleted successfully")
            else:
                print("✗ Failed to delete test app")
        except Exception as e:
            print(f"✗ Error during cleanup: {e}")

    print("\n=== TEST COMPLETE ===")

    if not accessible:
        print("\nTROUBLESHOOTING TIPS:")
        print("1. Check if the app has IP addresses in the Fly.io dashboard")
        print("2. Try running 'fly ips list -a {app_name}' in terminal")
        print("3. Ensure your Fly.io account has capacity for shared IPs")
        print("4. Check Fly.io status page for any ongoing issues")


if __name__ == "__main__":
    main()
