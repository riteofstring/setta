#!/usr/bin/env python3
"""
Master script to run all code generators in the correct order.

The generators have dependencies:
1. generate_derived_classes.py must run first (generates cores, modifiers, layerings, user defaults)
2. generate_type_system.py depends on generated classes from step 1
3. generate_app_utilities.py depends on generated user defaults from step 1
"""

import os
import subprocess
import sys
from pathlib import Path

from setta.utils.utils import get_absolute_path


def run_generator(script_name: str, output_folder: Path) -> bool:
    """Run a generator script and return True if successful."""
    script_path = Path(__file__).parent / script_name

    print(f"\n{'=' * 60}")
    print(f"Running {script_name}...")
    print(f"{'=' * 60}\n")

    try:
        # Add the parent directory to Python path to ensure imports work
        parent_dir = str(Path(__file__).parent.parent)
        env = os.environ.copy()
        if "PYTHONPATH" in env:
            env["PYTHONPATH"] = f"{parent_dir}{os.pathsep}{env['PYTHONPATH']}"
        else:
            env["PYTHONPATH"] = parent_dir

        result = subprocess.run(
            [sys.executable, str(script_path), str(output_folder)],
            check=True,
            capture_output=True,
            text=True,
            env=env,
        )
        print(result.stdout)
        if result.stderr:
            print("Warnings:", result.stderr)
        return True
    except subprocess.CalledProcessError as e:
        print(f"Error running {script_name}:")
        print(e.stdout)
        print(e.stderr)
        return False


def main(output_folder: Path):
    """Run all generators in the correct order."""
    print("Starting code generation...")
    print(f"Output folder: {output_folder}")

    # Ensure output folder exists
    output_folder.mkdir(parents=True, exist_ok=True)

    # Create __init__.py if it doesn't exist
    init_file = output_folder / "__init__.py"
    if not init_file.exists():
        init_file.write_text('"""Auto-generated type system modules."""\n')
        print(f"Created {init_file}")

    # Run generators in order
    generators = [
        "generate_derived_classes.py",  # Must run first
        "generate_type_system.py",  # Depends on derived classes
        "generate_app_utilities.py",  # Depends on user defaults
    ]

    for generator in generators:
        if not run_generator(generator, output_folder):
            print(f"\nGeneration failed at {generator}")
            sys.exit(1)

    print(f"\n{'=' * 60}")
    print("All code generation completed successfully!")
    print(f"{'=' * 60}")

    # List generated files
    print("\nGenerated files:")
    for file in sorted(output_folder.glob("*.py")):
        print(f"  - {file.name}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Generate all Setta type system code")
    parser.add_argument(
        "--output",
        "-o",
        type=Path,
        default=Path("../../backend/setta/types/generated"),
        help="Output directory for generated files",
    )
    parser.add_argument(
        "--clean",
        "-c",
        action="store_true",
        help="Clean output directory before generating",
    )

    args = parser.parse_args()

    output_folder = get_absolute_path(__file__, args.output)

    # Clean if requested
    if args.clean and output_folder.exists():
        print(f"Cleaning {output_folder}...")
        for file in output_folder.glob("*.py"):
            if file.name != "__init__.py":  # Preserve __init__.py
                file.unlink()
        print("Cleaned generated files (preserved __init__.py)")

    main(output_folder)
