"""Package entrypoint for ``python -m setta``.

The published CLI entrypoint is the console script ``setta`` (see
``pyproject.toml``). Some internal workflows (for example the JSON launcher)
spawn Setta via ``sys.executable -m setta`` so they inherit the active venv
without depending on the external script shim. That requires this module.
"""

from setta.start import cli


def main() -> None:
    cli()


if __name__ == "__main__":
    main()

