from argparse import ArgumentParser
from pathlib import Path

from setta.perf.section_benchmark_scene_builders import build_tier1_synthetic_scene


def main() -> None:
    parser = ArgumentParser(
        description="Build a checked-in section benchmark scene fixture."
    )
    parser.add_argument("scene_id", choices=["tier1Synthetic"])
    parser.add_argument("--output", required=True, help="Path to write the JSON fixture.")
    args = parser.parse_args()

    if args.scene_id != "tier1Synthetic":
        raise ValueError(f"Unsupported benchmark scene builder id: {args.scene_id}")

    scene = build_tier1_synthetic_scene()
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        scene.model_dump_json(indent=2, warnings=False),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
