"""
Debug authentication issues with the API.
"""

import asyncio
import os

import httpx
from dotenv import load_dotenv

load_dotenv()

API_URL = os.getenv("API_URL", "https://backend-production-6fbb.up.railway.app")


async def test_endpoints():
    print("Testing API endpoints...")
    print("=" * 60)

    # Test 1: Health check (no auth required)
    print("\n1. Testing health endpoint (no auth):")
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{API_URL}/health")
            print(f"   Status: {response.status_code}")
            print(f"   Response: {response.json()}")
    except Exception as e:
        print(f"   Error: {e}")

    # Test 2: Get current user (auth required)
    token = input(
        "\n2. Enter your authentication token (the long string after 'Bearer '): "
    ).strip()

    if not token:
        print("   No token provided, skipping auth tests")
        return

    print("\n3. Testing /api/me endpoint (auth required):")
    headers = {"Authorization": f"Bearer {token}"}

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(f"{API_URL}/api/me", headers=headers)
            print(f"   Status: {response.status_code}")
            if response.status_code == 200:
                print(f"   Response: {response.json()}")
                print("\n   ✅ Authentication is working!")
            else:
                print(f"   Response: {response.text}")
                print("\n   ❌ Authentication failed")

                # Debug info
                print("\n   Debug info:")
                print(f"   - Token length: {len(token)}")
                print(f"   - Token starts with: {token[:20]}...")
                print(f"   - Token ends with: ...{token[-20:]}")

    except Exception as e:
        print(f"   Error: {e}")

    # Test 3: List projects
    if response.status_code == 200:
        print("\n4. Testing /api/projects endpoint:")
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(f"{API_URL}/api/projects", headers=headers)
                print(f"   Status: {response.status_code}")
                if response.status_code == 200:
                    projects = response.json()
                    print(f"   Found {len(projects)} projects")
                else:
                    print(f"   Response: {response.text}")
        except Exception as e:
            print(f"   Error: {e}")


async def main():
    print("\nAPI Authentication Debug Tool")
    print("This will help identify authentication issues")
    print("\nIMPORTANT: When copying the token from browser DevTools:")
    print("- Copy ONLY the token string (not including 'Bearer ')")
    print("- The token should start with 'eyJ'")
    print("- It should be a very long string (hundreds of characters)")

    await test_endpoints()


if __name__ == "__main__":
    asyncio.run(main())
