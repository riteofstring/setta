from __future__ import annotations

from typing import Any


def render_markdown(report: dict[str, Any]) -> str:
    lines = [
        "# GPU Flow Retained Settings Finish-Line Report",
        "",
        f"- Generated: {report['generatedAt']}",
        f"- Source: `{report['source']}`",
        f"- Source kind: `{report['sourceKind']}`",
        f"- Analysis window: `{report['analysisWindowKind']}`",
        f"- Analysis start timestamp: `{report['analysisStartTimestampMs']}`",
        f"- Incomplete recording: `{report['incompleteRecording']}`",
        f"- Status: {'FAIL' if report['failureCount'] else 'PASS'}",
        "",
        "## Summary",
        "",
    ]
    append_markdown_key_values(lines, report["summary"])
    lines.extend(["", "## Budgets", ""])
    append_markdown_key_values(lines, report["budgets"])
    lines.extend(["", "## Failures", ""])
    append_markdown_key_values(lines, report["failures"])
    details = report["details"]
    append_markdown_long_tasks(lines, details)
    append_markdown_retained_budget_misses(lines, details)
    append_markdown_post_settle_uploads(lines, details)
    return "\n".join(lines) + "\n"


def append_markdown_key_values(lines: list[str], values: dict[str, Any]) -> None:
    for key, value in sorted(values.items()):
        lines.append(f"- {key}: `{value}`")


def append_markdown_long_tasks(lines: list[str], details: dict[str, Any]) -> None:
    lines.extend(["", "## Long Tasks", ""])
    for task in details["longtasks"]["gpuFlowOverBudget"][:10]:
        nearest = task.get("nearestFrame") or {}
        measures = task.get("overlappingGpuFlowMeasures") or []
        lines.append(
            "- "
            f"{task['durationMs']} ms near `{nearest.get('dominantPhase', 'unattributed')}` "
            f"frame `{(nearest.get('frame') or {}).get('frame')}` "
            f"overlapping measures `{summarize_measure_names(measures)}`"
        )
    if not details["longtasks"]["gpuFlowOverBudget"]:
        lines.append("- none")
    outside_longtasks = details["longtasks"].get("outsideGpuFlowOverBudget", [])
    lines.extend(["", "## Outside-GPU Long Tasks", ""])
    for task in outside_longtasks[:10]:
        nearest = task.get("nearestFrame") or {}
        nearby_measures = task.get("nearbyGpuFlowMeasures") or []
        lines.append(
            "- "
            f"{task['durationMs']} ms near frame "
            f"`{(nearest.get('frame') or {}).get('frame')}` with GPU phases "
            f"`{nearest.get('phaseDiagnostics', {})}` and nearby measures "
            f"`{summarize_measure_names(nearby_measures)}`"
        )
    if not outside_longtasks:
        lines.append("- none")
    lines.extend(["", "## Runtime Measures", ""])
    runtime_measure_phases = details.get("runtimeMeasurePhases", {})
    if runtime_measure_phases:
        append_markdown_key_values(lines, runtime_measure_phases)
    else:
        lines.append("- none")


def summarize_measure_names(measures: Any) -> list[str]:
    if not isinstance(measures, list):
        return []
    values = []
    for measure in measures[:5]:
        if not isinstance(measure, dict):
            continue
        values.append(f"{measure.get('phase')}@{measure.get('durationMs')}ms")
    return values


def append_markdown_retained_budget_misses(
    lines: list[str], details: dict[str, Any]
) -> None:
    lines.extend(["", "## Retained Budget Misses", ""])
    for miss in details["retainedBudgetMisses"][:20]:
        lines.append(
            "- "
            f"frame `{miss.get('frame')}` `{miss.get('reason')}` "
            f"`{miss.get('lane')}` `{miss.get('kind')}` "
            f"surface `{miss.get('surfaceId')}` bytes "
            f"`{(miss.get('estimate') or {}).get('uploadedBytes')}`"
        )
    if not details["retainedBudgetMisses"]:
        lines.append("- none")


def append_markdown_post_settle_uploads(
    lines: list[str], details: dict[str, Any]
) -> None:
    lines.extend(["", "## Post-Settle Retained Uploads", ""])
    for window in details["retainedAfterSettleWindows"]:
        lines.append(
            "- "
            f"start `{round(window['startTimestampMs'], 3)}`: "
            f"{window['uploadedBytes']} bytes ({window['uploadedMiB']} MiB), "
            f"{window['uploadCount']} uploads"
        )
    if not details["retainedAfterSettleWindows"]:
        lines.append("- none")
