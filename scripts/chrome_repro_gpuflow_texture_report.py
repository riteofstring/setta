#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


BYTES_PER_MIB = 1024 * 1024
DEFAULT_AFTER_SETTLE_WINDOW_MS = 1000.0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Summarize GPU-flow retained texture work from a Chrome repro recording.",
    )
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument(
        "--artifact-dir",
        type=Path,
        help="Chrome repro recording bundle directory to inspect.",
    )
    source.add_argument(
        "--latest",
        action="store_true",
        help="Resolve the latest Chrome repro recording with latest-chrome-recording.sh.",
    )
    parser.add_argument(
        "--after-settle-window-ms",
        default=DEFAULT_AFTER_SETTLE_WINDOW_MS,
        type=float,
        help="Window after each viewport interaction span used for post-settle upload totals.",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print machine-readable JSON.",
    )
    parser.add_argument(
        "--markdown",
        action="store_true",
        help="Print Markdown.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Write output to this path.",
    )
    args = parser.parse_args()

    artifact_dir = resolve_artifact_dir(args)
    report = analyze_recording(
        artifact_dir=artifact_dir,
        after_settle_window_ms=args.after_settle_window_ms,
    )
    output = render_output(report, emit_json=args.json, emit_markdown=args.markdown)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output, encoding="utf-8")
    else:
        print(output)
    return 0


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


def analyze_recording(
    *,
    artifact_dir: Path,
    after_settle_window_ms: float,
) -> dict[str, Any]:
    artifact_dir = artifact_dir.resolve()
    session = load_json_object(artifact_dir / "session.json")
    app_state_rows = read_ndjson(artifact_dir / "app_state.ndjson")
    performance_rows = read_ndjson(artifact_dir / "performance.ndjson")
    frame_events = [
        row["event"]
        for row in app_state_rows
        if row.get("event", {}).get("type") == "app-state"
        and row.get("event", {}).get("kind") == "gpu-flow-frame"
    ]
    hover_redraw_events = [
        row["event"]
        for row in app_state_rows
        if row.get("event", {}).get("type") == "app-state"
        and row.get("event", {}).get("kind") == "gpu-flow-retained-row-hover-redraw"
    ]
    longtask_events = [
        row["event"]
        for row in performance_rows
        if row.get("event", {}).get("entryType") == "longtask"
    ]
    frames = [event.get("payload", {}) for event in frame_events]
    frame_timestamps = [to_number(event.get("timestampMs")) for event in frame_events]
    frame_timestamps = [timestamp for timestamp in frame_timestamps if timestamp is not None]

    duration_values = [
        value
        for value in (to_number(frame.get("durationMs")) for frame in frames)
        if value is not None
    ]
    zoom_values = [
        value
        for value in (
            to_number((frame.get("viewport") or {}).get("zoom")) for frame in frames
        )
        if value is not None
    ]
    upload_summaries = [summarize_frame_uploads(frame) for frame in frames]
    total_uploaded_bytes = sum(summary["uploadedBytes"] for summary in upload_summaries)
    upload_frame_count = sum(1 for summary in upload_summaries if summary["uploadedBytes"] > 0)
    upload_diagnostics = [
        diagnostic
        for frame in frames
        for diagnostic in frame.get("uploadDiagnostics", [])
        if isinstance(diagnostic, dict)
    ]
    dirty_work_totals = sum_work_counts(
        frame.get("textureUploadInitialDirtyWorkCounts") for frame in frames
    )
    remaining_dirty_work_totals = sum_work_counts(
        frame.get("textureUploadRemainingDirtyWorkCounts") for frame in frames
    )
    upload_reason_counts = Counter(
        reason
        for diagnostic in upload_diagnostics
        for reason in diagnostic.get("reasons", [])
    )
    frame_reason_counts = Counter(
        reason for frame in frames for reason in frame.get("frameReasons", [])
    )
    memory_summary = summarize_texture_memory(frames)
    viewport_spans = find_viewport_interaction_spans(frame_events)
    after_settle = summarize_after_settle_windows(
        frame_events,
        after_settle_window_ms=after_settle_window_ms,
        viewport_spans=viewport_spans,
    )
    diagnostic_groups = summarize_upload_diagnostic_groups(upload_diagnostics)
    top_surfaces = summarize_top_surfaces(upload_diagnostics)
    hover_summary = summarize_hover_redraws(hover_redraw_events)
    top_duration_frames = summarize_top_frames(
        frames,
        key=lambda frame: to_number(frame.get("durationMs")) or 0.0,
    )
    top_upload_frames = summarize_top_frames(
        frames,
        key=lambda frame: summarize_frame_uploads(frame)["uploadedBytes"],
    )

    return {
        "artifactDir": str(artifact_dir),
        "createdAt": session.get("createdAt"),
        "eventCount": session.get("eventCount"),
        "finalizedAt": session.get("finalizedAt"),
        "recordingFile": str(artifact_dir / "recording.json"),
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "summary": {
            "afterSettleWindowMs": after_settle_window_ms,
            "budgetExhaustedFrameCount": sum(
                1 for frame in frames if frame.get("budgetExhausted")
            ),
            "dirtyWorkTotals": dirty_work_totals,
            "durationMs": summarize_values(duration_values),
            "frameCount": len(frames),
            "frameReasonCounts": dict(sorted(frame_reason_counts.items())),
            "hoverRedraws": hover_summary,
            "interactionActiveFrameCount": sum(
                1 for frame in frames if is_viewport_interaction_active(frame)
            ),
            "longtaskCount": len(longtask_events),
            "longtaskDurationMs": summarize_values(
                [
                    value
                    for value in (
                        to_number(event.get("durationMs")) for event in longtask_events
                    )
                    if value is not None
                ]
            ),
            "memory": memory_summary,
            "recordedDurationMs": (
                max(frame_timestamps) - min(frame_timestamps)
                if frame_timestamps
                else 0.0
            ),
            "remainingDirtyWorkTotals": remaining_dirty_work_totals,
            "topDurationFrames": top_duration_frames,
            "topUploadFrames": top_upload_frames,
            "topUploadedSurfaces": top_surfaces,
            "upload": {
                "diagnosticGroups": diagnostic_groups,
                "diagnosticCount": len(upload_diagnostics),
                "frameCount": upload_frame_count,
                "reasonCounts": dict(sorted(upload_reason_counts.items())),
                "totalUploadedBytes": total_uploaded_bytes,
                "totalUploadedMiB": mib(total_uploaded_bytes),
            },
            "uploadsAfterSettleWindows": after_settle,
            "viewportFrameCount": sum(1 for frame in frames if frame.get("viewportFrame")),
            "viewportInteractionSpans": viewport_spans,
            "zoom": {
                "max": max(zoom_values) if zoom_values else None,
                "min": min(zoom_values) if zoom_values else None,
            },
        },
    }


def summarize_frame_uploads(frame: dict[str, Any]) -> dict[str, float]:
    diagnostics = frame.get("uploadDiagnostics", [])
    if not isinstance(diagnostics, list):
        diagnostics = []
    return {
        "durationMs": sum(
            to_number(diagnostic.get("durationMs")) or 0.0
            for diagnostic in diagnostics
            if isinstance(diagnostic, dict)
        ),
        "uploadedBytes": sum(
            int(to_number(diagnostic.get("uploadedBytes")) or 0)
            for diagnostic in diagnostics
            if isinstance(diagnostic, dict)
        ),
    }


def summarize_upload_diagnostic_groups(
    diagnostics: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    groups = {
        "withDirtySourceRect": [],
        "withoutDirtySourceRect": [],
        "tiledWithoutDirtySourceRect": [],
    }
    for diagnostic in diagnostics:
        has_rect = bool(diagnostic.get("dirtySourceRect"))
        if has_rect:
            groups["withDirtySourceRect"].append(diagnostic)
        else:
            groups["withoutDirtySourceRect"].append(diagnostic)
            if diagnostic.get("textureLayoutKind") == "tiled":
                groups["tiledWithoutDirtySourceRect"].append(diagnostic)
    return {
        name: summarize_diagnostic_group(group)
        for name, group in groups.items()
    }


def summarize_diagnostic_group(group: list[dict[str, Any]]) -> dict[str, Any]:
    uploaded_bytes = sum(
        int(to_number(diagnostic.get("uploadedBytes")) or 0)
        for diagnostic in group
    )
    durations = [
        value
        for value in (to_number(diagnostic.get("durationMs")) for diagnostic in group)
        if value is not None
    ]
    return {
        "count": len(group),
        "durationMs": summarize_values(durations),
        "uploadedBytes": uploaded_bytes,
        "uploadedMiB": mib(uploaded_bytes),
    }


def summarize_top_surfaces(
    diagnostics: list[dict[str, Any]],
    limit: int = 12,
) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "count": 0,
            "dirtyRectCount": 0,
            "maxUploadBytes": 0,
            "maxUploadDurationMs": 0.0,
            "noDirtyRectCount": 0,
            "uploadedBytes": 0,
        }
    )
    for diagnostic in diagnostics:
        surface_id = diagnostic.get("surfaceId")
        if not isinstance(surface_id, str):
            continue
        group = grouped[surface_id]
        uploaded_bytes = int(to_number(diagnostic.get("uploadedBytes")) or 0)
        duration_ms = to_number(diagnostic.get("durationMs")) or 0.0
        group["count"] += 1
        group["uploadedBytes"] += uploaded_bytes
        group["maxUploadBytes"] = max(group["maxUploadBytes"], uploaded_bytes)
        group["maxUploadDurationMs"] = max(group["maxUploadDurationMs"], duration_ms)
        if diagnostic.get("dirtySourceRect"):
            group["dirtyRectCount"] += 1
        else:
            group["noDirtyRectCount"] += 1
    rows = []
    for surface_id, group in grouped.items():
        rows.append(
            {
                "surfaceId": surface_id,
                **group,
                "maxUploadMiB": mib(group["maxUploadBytes"]),
                "uploadedMiB": mib(group["uploadedBytes"]),
            }
        )
    return sorted(rows, key=lambda row: row["uploadedBytes"], reverse=True)[:limit]


def summarize_hover_redraws(events: list[dict[str, Any]]) -> dict[str, Any]:
    dirty_rect_count = 0
    dirty_rect_area = 0.0
    redrawn_surface_count = 0
    for event in events:
        payload = event.get("payload", {})
        redrawn = payload.get("redrawnSurfaceIds")
        if isinstance(redrawn, list):
            redrawn_surface_count += len(redrawn)
        rect_entries = payload.get("dirtySourceRectsBySurfaceId")
        if not isinstance(rect_entries, list):
            continue
        for entry in rect_entries:
            if not isinstance(entry, dict):
                continue
            rect = entry.get("rect")
            if not isinstance(rect, dict):
                continue
            width = to_number(rect.get("width")) or 0.0
            height = to_number(rect.get("height")) or 0.0
            dirty_rect_count += 1
            dirty_rect_area += width * height
    return {
        "dirtyRectCount": dirty_rect_count,
        "eventCount": len(events),
        "meanDirtyRectArea": (
            round(dirty_rect_area / dirty_rect_count, 3)
            if dirty_rect_count
            else None
        ),
        "redrawnSurfaceCount": redrawn_surface_count,
    }


def summarize_texture_memory(frames: list[dict[str, Any]]) -> dict[str, Any]:
    max_allocated = max(
        [int(to_number(frame.get("textureMemoryAllocatedBytes")) or 0) for frame in frames],
        default=0,
    )
    max_visible = max(
        [int(to_number(frame.get("textureMemoryVisibleBytes")) or 0) for frame in frames],
        default=0,
    )
    max_count = max(
        [int(to_number(frame.get("textureMemoryCount")) or 0) for frame in frames],
        default=0,
    )
    max_scale = 0.0
    for frame in frames:
        diagnostics = frame.get("textureLifecycleDiagnostics")
        if not isinstance(diagnostics, list):
            continue
        for diagnostic in diagnostics:
            if not isinstance(diagnostic, dict):
                continue
            for key in ("committed", "pending", "pendingResolution"):
                snapshot = diagnostic.get(key)
                if not isinstance(snapshot, dict):
                    continue
                max_scale = max(
                    max_scale,
                    to_number(snapshot.get("resolutionScale")) or 0.0,
                    to_number(snapshot.get("requestedScale")) or 0.0,
                )
    return {
        "maxAllocatedBytes": max_allocated,
        "maxAllocatedMiB": mib(max_allocated),
        "maxResolutionScale": max_scale,
        "maxTextureCount": max_count,
        "maxVisibleBytes": max_visible,
        "maxVisibleMiB": mib(max_visible),
    }


def find_viewport_interaction_spans(
    frame_events: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    spans: list[dict[str, Any]] = []
    active_start: float | None = None
    last_active: float | None = None
    active_frame_count = 0
    for event in frame_events:
        timestamp_ms = to_number(event.get("timestampMs"))
        if timestamp_ms is None:
            continue
        active = is_viewport_interaction_active(event.get("payload", {}))
        if active:
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


def summarize_after_settle_windows(
    frame_events: list[dict[str, Any]],
    *,
    after_settle_window_ms: float,
    viewport_spans: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    summaries = []
    for span in viewport_spans:
        start = to_number(span.get("endTimestampMs"))
        if start is None:
            continue
        end = start + after_settle_window_ms
        frames = [
            event.get("payload", {})
            for event in frame_events
            if (timestamp := to_number(event.get("timestampMs"))) is not None
            and timestamp > start
            and timestamp <= end
        ]
        upload_summaries = [summarize_frame_uploads(frame) for frame in frames]
        uploaded_bytes = sum(summary["uploadedBytes"] for summary in upload_summaries)
        summaries.append(
            {
                "frameCount": len(frames),
                "startTimestampMs": start,
                "uploadedBytes": uploaded_bytes,
                "uploadedMiB": mib(uploaded_bytes),
                "uploadFrameCount": sum(
                    1 for summary in upload_summaries if summary["uploadedBytes"] > 0
                ),
                "windowMs": after_settle_window_ms,
            }
        )
    return summaries


def summarize_top_frames(
    frames: list[dict[str, Any]],
    *,
    key: Any,
    limit: int = 10,
) -> list[dict[str, Any]]:
    rows = []
    for frame in frames:
        uploads = summarize_frame_uploads(frame)
        work_counts = frame.get("textureUploadInitialDirtyWorkCounts")
        rows.append(
            {
                "budgetExhausted": bool(frame.get("budgetExhausted")),
                "durationMs": to_number(frame.get("durationMs")) or 0.0,
                "frame": frame.get("frame"),
                "frameReasons": frame.get("frameReasons") or [],
                "initialDirtySurfaceCount": frame.get(
                    "textureUploadInitialDirtySurfaceCount"
                ),
                "initialDirtyWorkCounts": work_counts if isinstance(work_counts, dict) else {},
                "sortKey": key(frame),
                "uploadDurationMs": round(uploads["durationMs"], 3),
                "uploadedBytes": uploads["uploadedBytes"],
                "uploadedMiB": mib(uploads["uploadedBytes"]),
                "uploadedSurfaceCount": frame.get("textureUploadUploadedSurfaceCount"),
                "visibleNodeCount": frame.get("visibleNodeCount"),
                "zoom": (frame.get("viewport") or {}).get("zoom"),
            }
        )
    return [
        {key: value for key, value in row.items() if key != "sortKey"}
        for row in sorted(rows, key=lambda row: row["sortKey"], reverse=True)[:limit]
    ]


def is_viewport_interaction_active(frame: dict[str, Any]) -> bool:
    diagnostics = frame.get("interactionDiagnostics")
    if not isinstance(diagnostics, dict):
        return False
    viewport = diagnostics.get("viewport")
    if not isinstance(viewport, dict):
        return False
    return any(
        bool(viewport.get(key))
        for key in (
            "panScrolling",
            "pointerPanning",
            "viewportAnimating",
            "viewportInteractionActive",
            "wheelZooming",
        )
    )


def sum_work_counts(values: Any) -> dict[str, int]:
    totals: Counter[str] = Counter()
    for value in values:
        if not isinstance(value, dict):
            continue
        for key, raw_count in value.items():
            count = to_number(raw_count)
            if count is not None:
                totals[str(key)] += int(count)
    return dict(sorted(totals.items()))


def summarize_values(values: list[float]) -> dict[str, float | None]:
    if not values:
        return {
            "average": None,
            "max": None,
            "p50": None,
            "p90": None,
            "p95": None,
            "p99": None,
        }
    return {
        "average": round(sum(values) / len(values), 3),
        "max": round(max(values), 3),
        "p50": round(quantile(values, 0.5), 3),
        "p90": round(quantile(values, 0.9), 3),
        "p95": round(quantile(values, 0.95), 3),
        "p99": round(quantile(values, 0.99), 3),
    }


def quantile(values: list[float], q: float) -> float:
    ordered = sorted(values)
    if len(ordered) == 1:
        return ordered[0]
    index = (len(ordered) - 1) * q
    lower = int(index)
    upper = min(lower + 1, len(ordered) - 1)
    if lower == upper:
        return ordered[lower]
    ratio = index - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * ratio


def render_output(
    report: dict[str, Any],
    *,
    emit_json: bool,
    emit_markdown: bool,
) -> str:
    if not emit_json and not emit_markdown:
        emit_markdown = True
    if emit_json and emit_markdown:
        raise ValueError("Use only one of --json or --markdown.")
    if emit_json:
        return json.dumps(report, indent=2, sort_keys=True)
    return render_markdown_report(report)


def render_markdown_report(report: dict[str, Any]) -> str:
    summary = report["summary"]
    upload = summary["upload"]
    memory = summary["memory"]
    duration = summary["durationMs"]
    longtasks = summary["longtaskDurationMs"]
    lines = [
        "# GPU Flow Retained Texture Recording Summary",
        "",
        f"- Recording: `{report['artifactDir']}`",
        f"- Created: `{report.get('createdAt')}`",
        f"- Generated: `{report.get('generatedAt')}`",
        "",
        "## Frame Summary",
        "",
        f"- GPU-flow frames: {summary['frameCount']}",
        f"- Viewport frames: {summary['viewportFrameCount']}",
        f"- Interaction-active frames: {summary['interactionActiveFrameCount']}",
        f"- Upload frames: {upload['frameCount']}",
        f"- Budget-exhausted frames: {summary['budgetExhaustedFrameCount']}",
        f"- Recorded GPU-frame duration: {round(summary['recordedDurationMs'], 3)} ms",
        f"- Zoom range: {summary['zoom']['min']} to {summary['zoom']['max']}",
        "",
        "## Frame Duration",
        "",
        render_stat_bullets(duration),
        "",
        "## Upload Summary",
        "",
        f"- Uploaded bytes: {upload['totalUploadedBytes']} ({upload['totalUploadedMiB']} MiB)",
        f"- Upload diagnostics: {upload['diagnosticCount']}",
        f"- Upload reasons: `{json.dumps(upload['reasonCounts'], sort_keys=True)}`",
        "",
        "### Upload Diagnostic Groups",
        "",
        render_group_table(upload["diagnosticGroups"]),
        "",
        "## Dirty Work",
        "",
        f"- Initial dirty work totals: `{json.dumps(summary['dirtyWorkTotals'], sort_keys=True)}`",
        f"- Remaining dirty work totals: `{json.dumps(summary['remainingDirtyWorkTotals'], sort_keys=True)}`",
        "",
        "## Texture Memory",
        "",
        f"- Max allocated: {memory['maxAllocatedBytes']} ({memory['maxAllocatedMiB']} MiB)",
        f"- Max visible: {memory['maxVisibleBytes']} ({memory['maxVisibleMiB']} MiB)",
        f"- Max texture count: {memory['maxTextureCount']}",
        f"- Max requested/resolution scale: {memory['maxResolutionScale']}",
        "",
        "## Long Tasks",
        "",
        f"- Long task count: {summary['longtaskCount']}",
        render_stat_bullets(longtasks),
        "",
        "## Viewport Interaction Spans",
        "",
        render_viewport_spans(summary["viewportInteractionSpans"]),
        "",
        "## Uploads After Settle Windows",
        "",
        render_after_settle_windows(summary["uploadsAfterSettleWindows"]),
        "",
        "## Top Uploaded Surfaces",
        "",
        render_top_surfaces(summary["topUploadedSurfaces"]),
        "",
        "## Top Upload Frames",
        "",
        render_top_frames(summary["topUploadFrames"]),
        "",
        "## Top Duration Frames",
        "",
        render_top_frames(summary["topDurationFrames"]),
    ]
    return "\n".join(lines).rstrip() + "\n"


def render_stat_bullets(stats: dict[str, Any]) -> str:
    return "\n".join(
        [
            f"- Average: {stats['average']}",
            f"- p50: {stats['p50']}",
            f"- p90: {stats['p90']}",
            f"- p95: {stats['p95']}",
            f"- p99: {stats['p99']}",
            f"- Max: {stats['max']}",
        ]
    )


def render_group_table(groups: dict[str, dict[str, Any]]) -> str:
    lines = ["| Group | Count | Uploaded MiB | Max Duration Ms |", "| --- | ---: | ---: | ---: |"]
    for name, group in groups.items():
        lines.append(
            f"| `{name}` | {group['count']} | {group['uploadedMiB']} | {group['durationMs']['max']} |"
        )
    return "\n".join(lines)


def render_viewport_spans(spans: list[dict[str, Any]]) -> str:
    if not spans:
        return "- None"
    lines = ["| Span | Duration Ms | Frame Count |", "| ---: | ---: | ---: |"]
    for index, span in enumerate(spans, start=1):
        lines.append(
            f"| {index} | {span['durationMs']} | {span['frameCount']} |"
        )
    return "\n".join(lines)


def render_after_settle_windows(windows: list[dict[str, Any]]) -> str:
    if not windows:
        return "- None"
    lines = ["| Window | Frames | Upload Frames | Uploaded MiB |", "| ---: | ---: | ---: | ---: |"]
    for index, window in enumerate(windows, start=1):
        lines.append(
            f"| {index} | {window['frameCount']} | {window['uploadFrameCount']} | {window['uploadedMiB']} |"
        )
    return "\n".join(lines)


def render_top_surfaces(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "- None"
    lines = [
        "| Surface | Uploads | Uploaded MiB | No Rect | Dirty Rect | Max Upload MiB | Max Upload Ms |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for row in rows:
        lines.append(
            f"| `{row['surfaceId']}` | {row['count']} | {row['uploadedMiB']} | "
            f"{row['noDirtyRectCount']} | {row['dirtyRectCount']} | "
            f"{row['maxUploadMiB']} | {round(row['maxUploadDurationMs'], 3)} |"
        )
    return "\n".join(lines)


def render_top_frames(rows: list[dict[str, Any]]) -> str:
    if not rows:
        return "- None"
    lines = [
        "| Frame | Duration Ms | Upload Ms | Uploaded MiB | Zoom | Budget Exhausted | Work |",
        "| ---: | ---: | ---: | ---: | ---: | --- | --- |",
    ]
    for row in rows:
        lines.append(
            f"| {row['frame']} | {round(row['durationMs'], 3)} | "
            f"{row['uploadDurationMs']} | {row['uploadedMiB']} | {row['zoom']} | "
            f"{row['budgetExhausted']} | `{json.dumps(row['initialDirtyWorkCounts'], sort_keys=True)}` |"
        )
    return "\n".join(lines)


def load_json_object(path: Path) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return {}
    if not isinstance(value, dict):
        raise ValueError(f"Expected JSON object in {path}.")
    return value


def read_ndjson(path: Path) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        return rows
    for line_number, line in enumerate(lines, start=1):
        if not line.strip():
            continue
        value = json.loads(line)
        if not isinstance(value, dict):
            raise ValueError(f"Expected JSON object in {path}:{line_number}.")
        rows.append(value)
    return rows


def to_number(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    return None


def mib(value: int | float) -> float:
    return round(float(value) / BYTES_PER_MIB, 3)


if __name__ == "__main__":
    raise SystemExit(main())
