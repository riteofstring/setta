from argparse import ArgumentParser
import json
from pathlib import Path

from setta.perf.section_benchmark_scenes import install_section_benchmark_scene


def main() -> None:
    parser = ArgumentParser(
        description="Install a checked-in section benchmark scene into a target state root."
    )
    parser.add_argument("scene_id")
    parser.add_argument(
        "--state-root",
        required=True,
        help="Path to the target setta state root (for example setta_files_dev).",
    )
    args = parser.parse_args()

    result = install_section_benchmark_scene(
        scene_id=args.scene_id,
        state_root=Path(args.state_root),
    )
    print(json.dumps(result, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
