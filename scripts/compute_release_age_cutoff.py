#!/usr/bin/env python3

import argparse
from datetime import UTC, datetime, timedelta


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Compute an RFC 3339 UTC cutoff timestamp for a minimum package age policy."
    )
    parser.add_argument("days", type=int, help="Minimum package age in whole days.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if args.days < 0:
        raise SystemExit("days must be a non-negative integer")

    cutoff_timestamp = (datetime.now(UTC) - timedelta(days=args.days)).replace(
        microsecond=0
    )
    print(cutoff_timestamp.isoformat().replace("+00:00", "Z"))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
