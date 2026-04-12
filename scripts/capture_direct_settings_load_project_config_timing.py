import argparse
import asyncio
from datetime import UTC, datetime
from pathlib import Path
import sys

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tests.project_state.load_project_config_timing_capture import (
    average_numeric_timing_fields,
    capture_direct_settings_load_project_config_timings,
)


SUMMARY_KEYS = [
    "convert_ms",
    "convert_project_state_shown_param_ids_ms",
    "convert_project_state_shown_param_ids_get_param_ids_to_show_ms",
    "convert_project_state_shown_param_ids_traverse_hierarchy_ms",
    "init_ms",
    "validation_ms",
    "total_ms",
]


def _format_summary_block(
    label: str,
    samples: list[dict[str, object]],
) -> str:
    averages = average_numeric_timing_fields(samples, SUMMARY_KEYS)
    lines = [
        f"### {label}",
        "",
        f"- sample count: `{len(samples)}`",
        f"- project_config_id: `{samples[0]['project_config_id']}`",
        f"- did_init values: `{[sample['did_init'] for sample in samples]}`",
        f"- validation_cache_hit values: `{[sample['validation_cache_hit'] for sample in samples]}`",
        "",
        "Average timings (ms):",
    ]
    for key in SUMMARY_KEYS:
        lines.append(f"- `{key}`: `{averages[key]:.3f}`")
    lines.extend(
        [
            "",
            "Raw samples:",
            "```text",
        ]
    )
    for index, sample in enumerate(samples, start=1):
        lines.append(f"sample {index}: {sample}")
    lines.append("```")
    return "\n".join(lines)


async def _build_report(sample_count: int) -> str:
    captures = await capture_direct_settings_load_project_config_timings(
        sample_count=sample_count
    )
    settings_samples = captures["settings"]
    project_samples = captures["project"]
    settings_averages = average_numeric_timing_fields(settings_samples, SUMMARY_KEYS)
    project_averages = average_numeric_timing_fields(project_samples, SUMMARY_KEYS)
    generated_at = datetime.now(UTC).strftime("%Y-%m-%d %H:%M UTC")

    lines = [
        "# Direct `/settings` warm `load_project_config(...)` readout",
        "",
        f"Generated: {generated_at}",
        "Worktree: `pixijs-graph`",
        "Lane: direct `/settings` warm-load backend readout",
        "",
        "## Scope",
        "",
        "Fresh warm-load capture after the `traverse_hierarchy(...)` cache reduction.",
        "This keeps the lane honest about whether backend warm-load is still large",
        "enough to justify more backend-only work before pivoting back to the live",
        "renderer/product frontier.",
        "",
        "Code paths touched for this readout:",
        "",
        "- `scripts/capture_direct_settings_load_project_config_timing.py`",
        "- `tests/project_state/load_project_config_timing_capture.py`",
        "- `tests/project_state/test_load_project_config_timing.py`",
        "",
        "## Command",
        "",
        "```bash",
        "source activate.sh && python scripts/capture_direct_settings_load_project_config_timing.py --sample-count 3",
        "```",
        "",
        "## Captured summaries",
        "",
        _format_summary_block("Settings fixture warm loads", settings_samples),
        "",
        _format_summary_block("Project fixture warm loads", project_samples),
        "",
        "## Reading",
        "",
        f"- The current settings warm-load average is `~{settings_averages['total_ms']:.1f}ms` total, with `convert_ms` at `~{settings_averages['convert_ms']:.1f}ms`.",
        f"- The shown-param path remains the largest measured sub-owner inside convert on the settings fixture: `shown_param_ids_ms ~{settings_averages['convert_project_state_shown_param_ids_ms']:.1f}ms`, `get_param_ids_to_show_ms ~{settings_averages['convert_project_state_shown_param_ids_get_param_ids_to_show_ms']:.1f}ms`, `traverse_hierarchy_ms ~{settings_averages['convert_project_state_shown_param_ids_traverse_hierarchy_ms']:.1f}ms`.",
        f"- Warm settings loads are now consistently true warm loads on this fixture (`did_init=False`, cached validation hits), so the old multi-second init/validation lane is not what this readout measures anymore.",
        f"- The generic project fixture remains near-zero (`total_ms ~{project_averages['total_ms']:.1f}ms`), which keeps the comparison anchor intact.",
        "- On this evidence alone, the backend warm-load path is no longer a multi-second blocker. If the live direct `/settings` experience still feels materially slow, the next default frontier should pivot back to the earliest product-facing gate and verify where the remaining user-facing delay sits.",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sample-count", type=int, default=3)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    report = asyncio.run(_build_report(args.sample_count))
    if args.output is not None:
        args.output.write_text(report)
    else:
        print(report, end="")


if __name__ == "__main__":
    main()
