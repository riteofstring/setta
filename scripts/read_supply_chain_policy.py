#!/usr/bin/env python3

import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from supply_chain_policy import PolicyError, read_min_release_age_days


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Print the repo supply-chain minimum release age in days."
    )
    parser.add_argument(
        "--repo-root",
        type=Path,
        default=Path(__file__).resolve().parents[1],
        help="Repository root containing supply_chain_policy.env.",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    print(read_min_release_age_days(args.repo_root.resolve()))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except PolicyError as exc:
        raise SystemExit(str(exc)) from exc
