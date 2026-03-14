"""Compatibility shim for source/dev start workflows."""

import sys

from setta.entrypoint import run_go_dispatch


def normalize_dev_start_args(argv: list[str]) -> list[str]:
    normalized = list(argv)
    if "--reload" not in normalized:
        normalized.insert(0, "--reload")
    return normalized


def main(argv: list[str] | None = None) -> int:
    effective_argv = list(sys.argv[1:] if argv is None else argv)
    return run_go_dispatch(normalize_dev_start_args(effective_argv))


if __name__ == "__main__":
    raise SystemExit(main())
