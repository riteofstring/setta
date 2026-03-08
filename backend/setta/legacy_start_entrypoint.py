"""Explicit dev-only entrypoint for the legacy Click startup path."""

import sys

from setta.start import cli


def main(argv: list[str] | None = None) -> None:
    effective_argv = list(sys.argv[1:] if argv is None else argv)
    cli.main(args=effective_argv, prog_name="setta", standalone_mode=True)


if __name__ == "__main__":
    main()
