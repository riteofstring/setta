#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

try:
    from chrome_repro_gpuflow_finish_line_markdown import render_markdown
except ModuleNotFoundError:
    from scripts.chrome_repro_gpuflow_finish_line_markdown import render_markdown

BYTES_PER_MIB = 1024 * 1024
DEFAULT_LONG_TASK_MS = 50.0
DEFAULT_SETTLE_WINDOW_MS = 1000.0
DEFAULT_SETTLE_UPLOAD_BUDGET_BYTES = 8 * BYTES_PER_MIB
DEFAULT_HELD_PREVIOUS_MS = 120.0
FINISH_LINE_MARKER_KIND = "gpu-flow-finish-line-marker"
FINISH_LINE_START_MARKER_NAMES = frozenset({"finish-line-start", "start"})
GPU_FLOW_MEASURE_PREFIX = "setta.gpuFlow."


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Finish-line GPU Flow retained Settings report for Chrome repro "
            "recordings and Playwright performance snapshots."
        ),
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--artifact-dir", type=Path)
    source.add_argument("--latest", action="store_true")
    source.add_argument(
        "--snapshot-json",
        type=Path,
        help="Playwright JSON containing nodeLayerFrames and optional longTasks.",
    )
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--markdown", action="store_true")
    parser.add_argument("--output", type=Path)
    parser.add_argument("--max-long-task-ms", type=float, default=DEFAULT_LONG_TASK_MS)
    parser.add_argument(
        "--settle-window-ms",
        type=float,
        default=DEFAULT_SETTLE_WINDOW_MS,
    )
    parser.add_argument(
        "--settle-upload-budget-bytes",
        type=int,
        default=DEFAULT_SETTLE_UPLOAD_BUDGET_BYTES,
    )
    parser.add_argument(
        "--max-held-previous-ms",
        type=float,
        default=DEFAULT_HELD_PREVIOUS_MS,
    )
    args = parser.parse_args()

    report = analyze_source(args)
    output = render_output(report, emit_json=args.json, emit_markdown=args.markdown)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output)
    return 1 if report["failureCount"] > 0 else 0


def analyze_source(args: argparse.Namespace) -> dict[str, Any]:
    budgets = {
        "maxHeldPreviousMs": args.max_held_previous_ms,
        "maxLongTaskMs": args.max_long_task_ms,
        "settleUploadBudgetBytes": args.settle_upload_budget_bytes,
        "settleWindowMs": args.settle_window_ms,
    }
    if args.snapshot_json:
        return analyze_playwright_snapshot(args.snapshot_json.resolve(), budgets)
    artifact_dir = resolve_artifact_dir(args)
    return analyze_recording(artifact_dir, budgets)


def resolve_artifact_dir(args: argparse.Namespace) -> Path:
    if args.artifact_dir is not None:
        return args.artifact_dir.resolve()
    repo_root = Path(__file__).resolve().parents[1]
    helper = repo_root / "scripts" / "latest-chrome-recording.sh"
    completed = subprocess.run(
        [str(helper), "--json"],
        cwd=repo_root,
        check=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    payload = json.loads(completed.stdout)
    artifact_dir = payload.get("artifactDir")
    if not isinstance(artifact_dir, str):
        raise ValueError("latest-chrome-recording.sh did not return artifactDir.")
    return Path(artifact_dir).resolve()


def analyze_recording(artifact_dir: Path, budgets: dict[str, Any]) -> dict[str, Any]:
    session = load_json_object(artifact_dir / "session.json")
    app_state_rows = read_ndjson(artifact_dir / "app_state.ndjson")
    performance_rows = read_ndjson(artifact_dir / "performance.ndjson")
    analysis_start_ms = find_finish_line_analysis_start_ms(app_state_rows)
    frame_events = [
        row["event"]
        for row in app_state_rows
        if row.get("event", {}).get("type") == "app-state"
        and row.get("event", {}).get("kind") == "gpu-flow-frame"
    ]
    frames = [
        {
            "timestampMs": to_number(event.get("timestampMs")),
            "frame": event.get("payload", {}),
        }
        for event in frame_events
        if isinstance(event.get("payload"), dict)
    ]
    if analysis_start_ms is not None:
        frames = [
            entry
            for entry in frames
            if (timestamp := to_number(entry.get("timestampMs"))) is not None
            and timestamp >= analysis_start_ms
        ]
    longtasks = [
        row["event"]
        for row in performance_rows
        if row.get("event", {}).get("type") == "performance-longtask"
        or row.get("event", {}).get("entryType") == "longtask"
    ]
    if analysis_start_ms is not None:
        longtasks = [
            event
            for event in longtasks
            if (timestamp := to_number(event.get("timestampMs"))) is not None
            and timestamp >= analysis_start_ms
        ]
    performance_measures = [
        row["event"]
        for row in performance_rows
        if row.get("event", {}).get("type") == "performance-measure"
        or row.get("event", {}).get("entryType") == "measure"
    ]
    if analysis_start_ms is not None:
        performance_measures = [
            event
            for event in performance_measures
            if (timestamp := to_number(event.get("timestampMs"))) is not None
            and timestamp >= analysis_start_ms
        ]
    return analyze_frames(
        analysis_start_ms=analysis_start_ms,
        analysis_window_kind=(
            "finish-line-marker"
            if analysis_start_ms is not None
            else "full-recording-marker-missing"
        ),
        budgets=budgets,
        created_at=session.get("createdAt"),
        finalized_at=session.get("finalizedAt"),
        finish_line_marker_missing=analysis_start_ms is None,
        longtasks=longtasks,
        performance_measures=performance_measures,
        source=str(artifact_dir),
        source_kind="chrome-repro",
        timestamped_frames=frames,
    )


def analyze_playwright_snapshot(
    snapshot_path: Path, budgets: dict[str, Any]
) -> dict[str, Any]:
    payload = load_json_object(snapshot_path)
    frame_values = payload.get("nodeLayerFrames")
    if not isinstance(frame_values, list):
        frame_values = payload.get("frames")
    if not isinstance(frame_values, list):
        raise ValueError("Snapshot JSON must contain nodeLayerFrames or frames.")
    timestamped_frames = [
        {
            "timestampMs": (
                to_number(frame.get("timestampMs")) if isinstance(frame, dict) else None
            ),
            "frame": frame,
        }
        for frame in frame_values
        if isinstance(frame, dict)
    ]
    longtasks = payload.get("longTasks")
    performance_measures = payload.get("performanceMeasures")
    if not isinstance(performance_measures, list):
        performance_measures = payload.get("measures")
    return analyze_frames(
        analysis_start_ms=None,
        analysis_window_kind="playwright-snapshot",
        budgets=budgets,
        created_at=None,
        finalized_at=None,
        finish_line_marker_missing=False,
        longtasks=longtasks if isinstance(longtasks, list) else [],
        performance_measures=(
            performance_measures if isinstance(performance_measures, list) else []
        ),
        source=str(snapshot_path),
        source_kind="playwright-snapshot",
        timestamped_frames=timestamped_frames,
    )


def analyze_frames(
    *,
    analysis_start_ms: float | None,
    analysis_window_kind: str,
    budgets: dict[str, Any],
    created_at: Any,
    finalized_at: Any,
    finish_line_marker_missing: bool,
    longtasks: list[dict[str, Any]],
    performance_measures: list[dict[str, Any]],
    source: str,
    source_kind: str,
    timestamped_frames: list[dict[str, Any]],
) -> dict[str, Any]:
    frames = [entry["frame"] for entry in timestamped_frames]
    runtime_measures = normalize_gpu_flow_measures(performance_measures)
    viewport_spans = find_interaction_spans(timestamped_frames)
    retained_after_settle = summarize_retained_after_settle_windows(
        timestamped_frames,
        viewport_spans=viewport_spans,
        window_ms=float(budgets["settleWindowMs"]),
    )
    projection_violations = [
        summarize_projection_violation(frame)
        for frame in frames
        if is_motion_projection_frame(frame) and has_projection_content_work(frame)
    ]
    interaction_upload_violations = [
        summarize_interaction_upload_violation(frame)
        for frame in frames
        if is_interaction_active(frame)
        and retained_upload_count(frame) > 0
        and retained_upload_has_non_repair_work(frame)
    ]
    retained_budget_misses = [
        summarize_retained_budget_miss(frame, diagnostic)
        for frame in frames
        for diagnostic in retained_diagnostics(frame)
        if diagnostic.get("reason") in ("budget-exhausted", "deadline-exhausted")
    ]
    longtask_summaries = summarize_longtasks(
        longtasks=longtasks,
        max_long_task_ms=float(budgets["maxLongTaskMs"]),
        runtime_measures=runtime_measures,
        timestamped_frames=timestamped_frames,
    )
    cold_placeholders = [
        summarize_frame_identity(frame)
        for frame in frames
        if frame.get("retainedTexturePageTransactionOutcome")
        == "publish-cold-placeholder"
    ]
    true_hole_publications = [
        summarize_frame_identity(frame)
        for frame in frames
        if number_value(frame.get("retainedTexturePageTrueHoleRectCount")) > 0
        and frame.get("retainedTexturePageTransactionOutcome") != "hold-previous"
    ]
    held_previous_over_budget = [
        summarize_frame_identity(frame)
        for frame in frames
        if projection_held_previous_ms(frame) > float(budgets["maxHeldPreviousMs"])
        or bool(
            (frame.get("projectionDiagnostics") or {}).get("heldPreviousOverBudget")
        )
        or number_value(frame.get("retainedTexturePageTransactionMaxHeldMotionAgeMs"))
        > float(budgets["maxHeldPreviousMs"])
    ]
    post_settle_spikes = [
        window
        for window in retained_after_settle
        if window["uploadedBytes"] > int(budgets["settleUploadBudgetBytes"])
    ]
    missing_retained_diagnostics = [
        summarize_frame_identity(frame)
        for frame in frames
        if frame.get("retainedTexturePageDiagnosticCount", 0)
        and not retained_diagnostics(frame)
    ]
    missing_phase_projection_fields = [
        summarize_frame_identity(frame)
        for frame in frames
        if not isinstance(frame.get("phaseDiagnostics"), dict)
        or not isinstance(frame.get("projectionDiagnostics"), dict)
    ]

    failures = {
        "browserLongTaskCount": len(longtasks),
        "coldPlaceholderPublicationCount": len(cold_placeholders),
        "finishLineMarkerMissingCount": 1 if finish_line_marker_missing else 0,
        "gpuFlowLongTaskCount": len(longtask_summaries["gpuFlowOverBudget"]),
        "heldPreviousOverBudgetCount": len(held_previous_over_budget),
        "interactionNonRepairUploadCount": len(interaction_upload_violations),
        "longTaskCount": len(longtasks),
        "missingPhaseProjectionFieldCount": len(missing_phase_projection_fields),
        "missingRetainedDiagnosticDetailCount": len(missing_retained_diagnostics),
        "postSettleUploadSpikeCount": len(post_settle_spikes),
        "projectionContentWorkFrameCount": len(projection_violations),
        "retainedBudgetMissCount": len(retained_budget_misses),
        "retainedBudgetExhaustedFrameCount": sum(
            1 for frame in frames if frame.get("retainedTexturePageBudgetExhausted")
        ),
        "trueHolePublicationCount": len(true_hole_publications),
    }
    failure_count = sum(
        value for key, value in failures.items() if key != "longTaskCount" and value > 0
    )

    return {
        "analysisWindowKind": analysis_window_kind,
        "budgets": budgets,
        "analysisStartTimestampMs": analysis_start_ms,
        "createdAt": created_at,
        "failureCount": failure_count,
        "failures": failures,
        "finalizedAt": finalized_at,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "incompleteRecording": finish_line_marker_missing,
        "source": source,
        "sourceKind": source_kind,
        "summary": {
            "frameCount": len(frames),
            "frameModes": dict(Counter(frame_mode(frame) for frame in frames)),
            "interactionActiveFrameCount": sum(
                1 for frame in frames if is_interaction_active(frame)
            ),
            "longtaskCount": len(longtasks),
            "projectionFrameCount": sum(
                1 for frame in frames if is_motion_projection_frame(frame)
            ),
            "retainedUploadedBytes": sum(
                retained_uploaded_bytes(frame) for frame in frames
            ),
            "retainedUploadCount": sum(
                retained_upload_count(frame) for frame in frames
            ),
            "runtimeMeasureCount": len(runtime_measures),
            "transactionOutcomes": dict(
                Counter(
                    str(frame.get("retainedTexturePageTransactionOutcome") or "none")
                    for frame in frames
                )
            ),
        },
        "details": {
            "coldPlaceholders": cold_placeholders[:20],
            "heldPreviousOverBudget": held_previous_over_budget[:20],
            "interactionUploadViolations": interaction_upload_violations[:20],
            "longtasks": longtask_summaries,
            "missingPhaseProjectionFields": missing_phase_projection_fields[:20],
            "missingRetainedDiagnostics": missing_retained_diagnostics[:20],
            "postSettleSpikes": post_settle_spikes,
            "projectionViolations": projection_violations[:20],
            "retainedAfterSettleWindows": retained_after_settle,
            "retainedBudgetMisses": retained_budget_misses[:40],
            "runtimeMeasurePhases": dict(
                Counter(measure["phase"] for measure in runtime_measures)
            ),
            "trueHolePublications": true_hole_publications[:20],
            "viewportInteractionSpans": viewport_spans,
        },
    }


def find_finish_line_analysis_start_ms(
    app_state_rows: list[dict[str, Any]],
) -> float | None:
    for row in app_state_rows:
        event = row.get("event")
        if not isinstance(event, dict):
            continue
        if (
            event.get("type") != "app-state"
            or event.get("kind") != FINISH_LINE_MARKER_KIND
        ):
            continue
        payload = event.get("payload")
        if not isinstance(payload, dict):
            continue
        if payload.get("name") not in FINISH_LINE_START_MARKER_NAMES:
            continue
        timestamp_ms = to_number(event.get("timestampMs"))
        if timestamp_ms is not None:
            return timestamp_ms
    return None


def normalize_gpu_flow_measures(
    performance_measures: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    measures = []
    for event in performance_measures:
        name = event.get("name")
        if not isinstance(name, str) or not name.startswith(GPU_FLOW_MEASURE_PREFIX):
            continue
        start_time_ms = to_number(event.get("startTimeMs"))
        duration_ms = to_number(event.get("durationMs"))
        if start_time_ms is None or duration_ms is None:
            continue
        detail = event.get("detail")
        detail = detail if isinstance(detail, dict) else {}
        phase = detail.get("phase")
        if not isinstance(phase, str):
            phase = parse_gpu_flow_measure_phase(name)
        measures.append(
            {
                "detail": detail,
                "durationMs": duration_ms,
                "endTimeMs": start_time_ms + duration_ms,
                "frame": parse_nullable_int(detail.get("frame"))
                or parse_measure_int_field(name, "frame"),
                "name": name,
                "phase": phase,
                "startTimeMs": start_time_ms,
            }
        )
    return measures


def parse_gpu_flow_measure_phase(name: str) -> str:
    rest = name.removeprefix(GPU_FLOW_MEASURE_PREFIX)
    return rest.split(" ", 1)[0] if rest else "unknown"


def parse_measure_int_field(name: str, field: str) -> int | None:
    prefix = f"{field}="
    for part in name.split(" ")[1:]:
        if not part.startswith(prefix):
            continue
        try:
            return int(float(part.removeprefix(prefix)))
        except ValueError:
            return None
    return None


def parse_nullable_int(value: Any) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return None


def summarize_longtasks(
    *,
    longtasks: list[dict[str, Any]],
    max_long_task_ms: float,
    runtime_measures: list[dict[str, Any]],
    timestamped_frames: list[dict[str, Any]],
) -> dict[str, Any]:
    summaries = []
    over_budget = []
    for event in longtasks:
        duration_ms = number_value(event.get("durationMs"))
        timestamp_ms = to_number(event.get("timestampMs"))
        start_time_ms = to_number(event.get("startTimeMs"))
        end_time_ms = start_time_ms + duration_ms if start_time_ms is not None else None
        overlapping_measures = find_overlapping_gpu_flow_measures(
            runtime_measures=runtime_measures,
            start_time_ms=start_time_ms,
            end_time_ms=end_time_ms,
        )
        nearby_measures = find_nearby_gpu_flow_measures(
            runtime_measures=runtime_measures,
            start_time_ms=start_time_ms,
        )
        nearest = nearest_frame(timestamped_frames, timestamp_ms)
        summary = {
            "attribution": (
                event.get("attribution")
                if isinstance(event.get("attribution"), list)
                else []
            ),
            "durationMs": duration_ms,
            "endTimeMs": end_time_ms,
            "name": event.get("name"),
            "nearestFrame": nearest,
            "nearbyGpuFlowMeasures": nearby_measures,
            "overlappingGpuFlowMeasures": overlapping_measures,
            "startTimeMs": start_time_ms,
            "timestampMs": timestamp_ms,
        }
        summaries.append(summary)
        if duration_ms > max_long_task_ms:
            over_budget.append(summary)
    return {
        "all": summaries,
        "gpuFlowOverBudget": [
            task for task in over_budget if longtask_overlaps_gpu_flow_work(task)
        ],
        "outsideGpuFlowOverBudget": [
            task for task in over_budget if not longtask_overlaps_gpu_flow_work(task)
        ],
        "overBudget": over_budget,
        "unattributedOverBudget": [
            task for task in over_budget if task["nearestFrame"] is None
        ],
    }


def longtask_overlaps_gpu_flow_work(task: dict[str, Any]) -> bool:
    overlapping_measures = task.get("overlappingGpuFlowMeasures")
    if isinstance(overlapping_measures, list) and overlapping_measures:
        durations = [
            number_value(measure.get("durationMs"))
            for measure in overlapping_measures
            if isinstance(measure, dict)
        ]
        return max(durations, default=0) >= 8 or sum(durations) >= 25
    nearest = task.get("nearestFrame")
    if not isinstance(nearest, dict):
        return True
    phase = nearest.get("phaseDiagnostics")
    if not isinstance(phase, dict):
        return True
    phase_durations = [
        number_value(value)
        for key, value in phase.items()
        if key.endswith("Ms") and isinstance(value, (int, float))
    ]
    if not phase_durations:
        return True
    return max(phase_durations) >= 8 or sum(phase_durations) >= 25


def find_overlapping_gpu_flow_measures(
    *,
    runtime_measures: list[dict[str, Any]],
    start_time_ms: float | None,
    end_time_ms: float | None,
) -> list[dict[str, Any]]:
    if start_time_ms is None or end_time_ms is None:
        return []
    return [
        summarize_gpu_flow_measure(measure)
        for measure in runtime_measures
        if measure["startTimeMs"] < end_time_ms and measure["endTimeMs"] > start_time_ms
    ][:20]


def find_nearby_gpu_flow_measures(
    *,
    runtime_measures: list[dict[str, Any]],
    start_time_ms: float | None,
) -> list[dict[str, Any]]:
    if start_time_ms is None:
        return []
    candidates = [
        {
            **summarize_gpu_flow_measure(measure),
            "distanceMs": round(abs(measure["startTimeMs"] - start_time_ms), 3),
        }
        for measure in runtime_measures
    ]
    return sorted(candidates, key=lambda measure: measure["distanceMs"])[:8]


def summarize_gpu_flow_measure(measure: dict[str, Any]) -> dict[str, Any]:
    return {
        "durationMs": round(number_value(measure.get("durationMs")), 3),
        "frame": measure.get("frame"),
        "name": measure.get("name"),
        "phase": measure.get("phase"),
        "startTimeMs": round(number_value(measure.get("startTimeMs")), 3),
    }


def nearest_frame(
    timestamped_frames: list[dict[str, Any]], timestamp_ms: float | None
) -> dict[str, Any] | None:
    if timestamp_ms is None:
        return None
    candidates = [
        entry
        for entry in timestamped_frames
        if isinstance(entry.get("timestampMs"), (int, float))
    ]
    if not candidates:
        return None
    nearest = min(
        candidates, key=lambda entry: abs(entry["timestampMs"] - timestamp_ms)
    )
    distance_ms = abs(nearest["timestampMs"] - timestamp_ms)
    frame = nearest["frame"]
    return {
        "distanceMs": round(distance_ms, 3),
        "dominantPhase": dominant_phase(frame),
        "frame": summarize_frame_identity(frame),
        "frameReasons": string_list(frame.get("frameReasons")),
        "phaseDiagnostics": (
            frame.get("phaseDiagnostics")
            if isinstance(frame.get("phaseDiagnostics"), dict)
            else {}
        ),
    }


def dominant_phase(frame: dict[str, Any]) -> str | None:
    diagnostics = frame.get("phaseDiagnostics")
    if not isinstance(diagnostics, dict):
        return None
    values = {
        key: number_value(value)
        for key, value in diagnostics.items()
        if key.endswith("Ms") and isinstance(value, (int, float))
    }
    if not values:
        return None
    return max(values, key=values.get)


def has_projection_content_work(frame: dict[str, Any]) -> bool:
    phase = frame.get("phaseDiagnostics")
    return (
        frame_mode(frame) != "projection"
        or number_value((phase or {}).get("committedContentPublishMs")) > 0
        or number_value((phase or {}).get("retainedDisplayTransactionMs")) > 0
        or number_value((phase or {}).get("retainedPageFrameMs")) > 0
        or number_value((phase or {}).get("retainedPageMaintenanceMs")) > 0
        or number_value((phase or {}).get("retainedRuntimeFrameMs")) > 0
        or number_value(frame.get("retainedTexturePageCoverageCandidateCount")) > 0
        or number_value(frame.get("retainedTexturePageDrawQuadCount")) > 0
        or number_value(frame.get("retainedTexturePageRasterMs")) > 0
        or number_value(frame.get("retainedTexturePageTargetDescriptorCount")) > 0
        or frame.get("retainedTexturePageTransactionOutcome") not in (None, "none")
        or retained_upload_count(frame) > 0
        or number_value(frame.get("retainedTexturePageUploadMs")) > 0
        or number_value(frame.get("uploadDiagnosticCount")) > 0
    )


def summarize_projection_violation(frame: dict[str, Any]) -> dict[str, Any]:
    return {
        **summarize_frame_identity(frame),
        "phaseDiagnostics": frame.get("phaseDiagnostics"),
        "retainedUploadCount": retained_upload_count(frame),
        "uploadDiagnosticCount": number_value(frame.get("uploadDiagnosticCount")),
    }


def retained_upload_has_non_repair_work(frame: dict[str, Any]) -> bool:
    executed = retained_executed_items(frame)
    if not executed:
        return retained_upload_count(frame) > 0
    return any(item.get("lane") != "visible-repair" for item in executed)


def summarize_interaction_upload_violation(frame: dict[str, Any]) -> dict[str, Any]:
    return {
        **summarize_frame_identity(frame),
        "executedItems": retained_executed_items(frame),
        "retainedUploadedBytes": retained_uploaded_bytes(frame),
        "retainedUploadCount": retained_upload_count(frame),
    }


def summarize_retained_budget_miss(
    frame: dict[str, Any], diagnostic: dict[str, Any]
) -> dict[str, Any]:
    return {
        **summarize_frame_identity(frame),
        "estimate": diagnostic.get("estimate"),
        "kind": diagnostic.get("kind"),
        "lane": diagnostic.get("lane"),
        "priority": diagnostic.get("priority"),
        "projectionHorizonGeneration": diagnostic.get("projectionHorizonGeneration"),
        "queue": diagnostic.get("queue"),
        "reason": diagnostic.get("reason"),
        "sourceRect": diagnostic.get("sourceRect"),
        "sourceWindow": diagnostic.get("sourceWindow"),
        "surfaceId": diagnostic.get("surfaceId"),
        "targetLod": diagnostic.get("targetLod"),
        "contentVersion": diagnostic.get("contentVersion"),
    }


def find_interaction_spans(
    timestamped_frames: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    spans = []
    active_start = None
    last_active = None
    active_frame_count = 0
    for entry in timestamped_frames:
        timestamp_ms = entry.get("timestampMs")
        if not isinstance(timestamp_ms, (int, float)):
            continue
        if is_interaction_active(entry["frame"]):
            if active_start is None:
                active_start = timestamp_ms
                active_frame_count = 0
            last_active = timestamp_ms
            active_frame_count += 1
        elif active_start is not None and last_active is not None:
            spans.append(
                {
                    "durationMs": round(last_active - active_start, 3),
                    "endTimestampMs": last_active,
                    "frameCount": active_frame_count,
                    "startTimestampMs": active_start,
                }
            )
            active_start = None
            last_active = None
            active_frame_count = 0
    if active_start is not None and last_active is not None:
        spans.append(
            {
                "durationMs": round(last_active - active_start, 3),
                "endTimestampMs": last_active,
                "frameCount": active_frame_count,
                "startTimestampMs": active_start,
            }
        )
    return spans


def summarize_retained_after_settle_windows(
    timestamped_frames: list[dict[str, Any]],
    *,
    viewport_spans: list[dict[str, Any]],
    window_ms: float,
) -> list[dict[str, Any]]:
    summaries = []
    for span in viewport_spans:
        start = to_number(span.get("endTimestampMs"))
        if start is None:
            continue
        end = start + window_ms
        frames = [
            entry["frame"]
            for entry in timestamped_frames
            if (timestamp := to_number(entry.get("timestampMs"))) is not None
            and timestamp > start
            and timestamp <= end
        ]
        uploaded_bytes = sum(retained_uploaded_bytes(frame) for frame in frames)
        summaries.append(
            {
                "frameCount": len(frames),
                "startTimestampMs": start,
                "uploadedBytes": uploaded_bytes,
                "uploadedMiB": mib(uploaded_bytes),
                "uploadCount": sum(retained_upload_count(frame) for frame in frames),
                "uploadFrameCount": sum(
                    1 for frame in frames if retained_upload_count(frame) > 0
                ),
                "windowMs": window_ms,
            }
        )
    return summaries


def summarize_frame_identity(frame: dict[str, Any]) -> dict[str, Any]:
    projection = frame.get("projectionDiagnostics")
    return {
        "frame": int(number_value(frame.get("frame"))),
        "frameMode": frame_mode(frame),
        "frameReasons": string_list(frame.get("frameReasons")),
        "heldPreviousDurationMs": (
            projection.get("heldPreviousDurationMs")
            if isinstance(projection, dict)
            else None
        ),
        "heldPreviousFrameCount": (
            projection.get("heldPreviousFrameCount")
            if isinstance(projection, dict)
            else None
        ),
        "heldPreviousReason": (
            projection.get("heldPreviousReason")
            if isinstance(projection, dict)
            else None
        ),
        "heldPreviousRequestedSampleId": (
            projection.get("heldPreviousRequestedSampleId")
            if isinstance(projection, dict)
            else None
        ),
        "projectionSampleId": (
            projection.get("sampleId") if isinstance(projection, dict) else None
        ),
        "projectionTransactionId": (
            projection.get("transactionId") if isinstance(projection, dict) else None
        ),
        "retainedTransactionBlockingGenerationIds": string_list(
            frame.get("retainedTexturePageTransactionBlockingGenerationIds")
        ),
        "retainedTransactionBlockingSurfaceIds": string_list(
            frame.get("retainedTexturePageTransactionBlockingSurfaceIds")
        ),
        "retainedTransactionHoldReason": frame.get(
            "retainedTexturePageTransactionHoldReason"
        ),
        "retainedTransactionOutcome": frame.get(
            "retainedTexturePageTransactionOutcome"
        ),
    }


def is_motion_projection_frame(frame: dict[str, Any]) -> bool:
    projection = frame.get("projectionDiagnostics")
    return (
        frame_mode(frame) == "projection"
        and isinstance(projection, dict)
        and projection.get("lane") == "motion"
    )


def is_interaction_active(frame: dict[str, Any]) -> bool:
    if frame.get("deferResolutionUpdates") is True:
        return True
    projection = frame.get("projectionDiagnostics")
    if isinstance(projection, dict) and projection.get("lane") == "motion":
        return True
    return any(
        reason in ("retained-scroll", "viewport")
        for reason in string_list(frame.get("frameReasons"))
    )


def frame_mode(frame: dict[str, Any]) -> str:
    phase = frame.get("phaseDiagnostics")
    if isinstance(phase, dict) and isinstance(phase.get("frameMode"), str):
        return phase["frameMode"]
    return "projection" if frame.get("deferResolutionUpdates") else "content"


def retained_diagnostics(frame: dict[str, Any]) -> list[dict[str, Any]]:
    diagnostics = frame.get("retainedTexturePageDiagnostics")
    return (
        [item for item in diagnostics if isinstance(item, dict)]
        if isinstance(diagnostics, list)
        else []
    )


def retained_executed_items(frame: dict[str, Any]) -> list[dict[str, Any]]:
    items = frame.get("retainedTexturePageExecutedItems")
    return (
        [item for item in items if isinstance(item, dict)]
        if isinstance(items, list)
        else []
    )


def retained_upload_count(frame: dict[str, Any]) -> int:
    return int(number_value(frame.get("retainedTexturePageUploadCount")))


def retained_uploaded_bytes(frame: dict[str, Any]) -> int:
    return int(number_value(frame.get("retainedTexturePageUploadedBytes")))


def projection_held_previous_ms(frame: dict[str, Any]) -> float:
    projection = frame.get("projectionDiagnostics")
    if isinstance(projection, dict):
        return number_value(projection.get("heldPreviousDurationMs"))
    return 0.0


def render_output(
    report: dict[str, Any], *, emit_json: bool, emit_markdown: bool
) -> str:
    if not emit_json and not emit_markdown:
        emit_markdown = True
    if emit_json and emit_markdown:
        raise ValueError("Use only one of --json or --markdown.")
    if emit_json:
        return json.dumps(report, indent=2, sort_keys=True)
    return render_markdown(report)


def load_json_object(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object in {path}.")
    return value


def read_ndjson(path: Path) -> list[dict[str, Any]]:
    rows = []
    if not path.exists():
        return rows
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            text = line.strip()
            if not text:
                continue
            value = json.loads(text)
            if isinstance(value, dict):
                rows.append(value)
    return rows


def string_list(value: Any) -> list[str]:
    return (
        [item for item in value if isinstance(item, str)]
        if isinstance(value, list)
        else []
    )


def to_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def number_value(value: Any) -> float:
    return to_number(value) or 0.0


def mib(value: int) -> float:
    return round(value / BYTES_PER_MIB, 3)


if __name__ == "__main__":
    sys.exit(main())
