#!/usr/bin/env python3
"""
Utility to check IP addresses for existing Fly.io apps
"""

import sys

from app.fly_manager import FlyManager


def main():
    if len(sys.argv) < 2:
        print("Usage: python check_fly_ips.py <app-name>")
        print("Example: python check_fly_ips.py setta-my-project-1234567890")
        sys.exit(1)

    app_name = sys.argv[1]

    print(f"Checking IPs for app: {app_name}\n")

    fly = FlyManager()

    # Check app status
    status = fly.get_app_status(app_name)
    if not status:
        print(f"✗ App '{app_name}' not found")
        sys.exit(1)

    print(f"App found: {status.name}")
    print(f"Hostname: {status.hostname}")
    print(f"Status: {status.status}")
    print(f"Deployed: {status.deployed}")
    print(f"Machines: {len(status.machines)}")

    # Check IPs
    print("\nChecking IP addresses...")
    has_ips = fly._check_app_ips(app_name)

    if not has_ips:
        print("\n✗ No IP addresses found!")
        print("\nTo allocate IPs, you can:")
        print(f"1. Run: fly ips allocate-v6 -a {app_name}")
        print("2. Or use this script with --allocate flag")

        if len(sys.argv) > 2 and sys.argv[2] == "--allocate":
            print("\nAllocating IPv6...")
            if fly._allocate_ipv6(app_name):
                print("✓ IPv6 allocated successfully!")
                print("\nRechecking IPs...")
                fly._check_app_ips(app_name)
            else:
                print("✗ Failed to allocate IPv6")
    else:
        print("\n✓ App has IP addresses")


if __name__ == "__main__":
    main()
