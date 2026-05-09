#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import math
import subprocess
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DEFAULT_TARGET_CSS_SUBSTRING = "leftSidePaneShiftsMap"
DEFAULT_WINDOW_MS = 900.0
NANOSECONDS_PER_MILLISECOND = 1_000_000


@dataclass(frozen=True)
class PerformanceEvent:
    sequence_number: int
    received_at: str
    timestamp_ms: float
    event: dict[str, Any]


@dataclass(frozen=True)
class BackendRequest:
    completed_at_ms: float
    duration_ms: float
    method: str
    path: str
    started_at_ms: float
    status: int | None


@dataclass(frozen=True)
class ToggleInteraction:
    click: PerformanceEvent
    end_timestamp_ms: float
    pointerup_target_css_path: str
    pointerup_target_text: str


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Summarize toggle jank signals from a Chrome repro recording bundle."
        ),
    )
    source_group = parser.add_mutually_exclusive_group(required=True)
    source_group.add_argument(
        "--artifact-dir",
        type=Path,
        help="Chrome repro recording bundle directory to inspect.",
    )
    source_group.add_argument(
        "--latest",
        action="store_true",
        help="Resolve the latest Chrome repro recording with latest-chrome-recording.sh.",
    )
    parser.add_argument(
        "--target-css-substring",
        default=DEFAULT_TARGET_CSS_SUBSTRING,
        help=(
            "Substring used to identify target pointerup/click CSS paths. "
            f"Default: {DEFAULT_TARGET_CSS_SUBSTRING!r}."
        ),
    )
    parser.add_argument(
        "--window-ms",
        default=DEFAULT_WINDOW_MS,
        type=float,
        help=(
            "Maximum correlation window after each target click. The window is "
            "also capped at the next target click. Default: 900."
        ),
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Print the machine-readable summary as JSON.",
    )
    parser.add_argument(
        "--markdown",
        action="store_true",
        help="Print the human-readable Markdown report.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        help="Write the selected report format to this path.",
    )
    args = parser.parse_args()

    artifact_dir = resolve_artifact_dir(args)
    report = analyze_recording(
        artifact_dir=artifact_dir,
        target_css_substring=args.target_css_substring,
        window_ms=args.window_ms,
    )
    output_text = render_output(
        report, emit_json=args.json, emit_markdown=args.markdown
    )
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(output_text, encoding="utf-8")
    else:
        print(output_text)
    return 0


def resolve_artifact_dir(args: argparse.Namespace) -> Path:
    if args.artifact_dir is not None:
        return args.artifact_dir.resolve()
    root_dir = Path(__file__).resolve().parents[1]
    helper = root_dir / "scripts" / "latest-chrome-recording.sh"
    completed = subprocess.run(
        [str(helper), "--json"],
        cwd=root_dir,
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


def analyze_recording(
    *,
    artifact_dir: Path,
    target_css_substring: str = DEFAULT_TARGET_CSS_SUBSTRING,
    window_ms: float = DEFAULT_WINDOW_MS,
) -> dict[str, Any]:
    artifact_dir = artifact_dir.resolve()
    session = load_json_object(artifact_dir / "session.json")
    performance_rows = read_ndjson(artifact_dir / "performance.ndjson")
    app_state_rows = read_ndjson(artifact_dir / "app_state.ndjson")
    backend_requests = read_backend_requests(artifact_dir / "logs" / "backend.log")

    performance_events = [
        to_performance_event(row)
        for row in performance_rows
        if isinstance(row.get("event"), dict)
    ]
    click_events = [
        event
        for event in performance_events
        if event.event.get("type") == "performance-event"
        and event.event.get("name") == "click"
    ]
    pointerup_by_interaction_id = {
        event.event.get("interactionId"): event
        for event in performance_events
        if event.event.get("type") == "performance-event"
        and event.event.get("name") == "pointerup"
    }
    interactions = identify_target_interactions(
        click_events,
        pointerup_by_interaction_id,
        target_css_substring,
        window_ms,
    )

    frame_gap_events = [
        event
        for event in performance_events
        if event.event.get("type") == "performance-frame-gap"
    ]
    longtask_events = [
        event
        for event in performance_events
        if event.event.get("type") == "performance-longtask"
    ]
    websocket_events = [
        to_performance_event(row)
        for row in app_state_rows
        if row.get("event", {}).get("type") == "app-state"
        and row.get("event", {}).get("kind") == "perf-websocket-message"
    ]
    gpu_frame_events = [
        to_performance_event(row)
        for row in app_state_rows
        if row.get("event", {}).get("type") == "app-state"
        and row.get("event", {}).get("kind") == "gpu-flow-frame"
    ]

    interaction_summaries = [
        summarize_interaction(
            interaction,
            frame_gap_events,
            longtask_events,
            websocket_events,
            gpu_frame_events,
            backend_requests,
        )
        for interaction in interactions
    ]
    aggregate = summarize_interactions(interaction_summaries)
    return {
        "artifactDir": str(artifact_dir),
        "createdAt": session.get("createdAt"),
        "eventCount": session.get("eventCount"),
        "finalizedAt": session.get("finalizedAt"),
        "recordingFile": str(artifact_dir / "recording.json"),
        "targetCssSubstring": target_css_substring,
        "windowMs": window_ms,
        "summary": aggregate,
        "interactions": interaction_summaries,
    }


def identify_target_interactions(
    click_events: list[PerformanceEvent],
    pointerup_by_interaction_id: dict[Any, PerformanceEvent],
    target_css_substring: str,
    window_ms: float,
) -> list[ToggleInteraction]:
    target_interactions: list[ToggleInteraction] = []
    for click in click_events:
        interaction_id = click.event.get("interactionId")
        pointerup = pointerup_by_interaction_id.get(interaction_id)
        target_css_path = target_css_path_for_event(
            pointerup.event if pointerup else {}
        )
        target_text = target_text_for_event(pointerup.event if pointerup else {})
        click_target_css_path = target_css_path_for_event(click.event)
        if (
            target_css_substring not in target_css_path
            and target_css_substring not in click_target_css_path
        ):
            continue
        target_interactions.append(
            ToggleInteraction(
                click=click,
                end_timestamp_ms=click.timestamp_ms + window_ms,
                pointerup_target_css_path=target_css_path,
                pointerup_target_text=target_text,
            ),
        )

    capped_interactions: list[ToggleInteraction] = []
    for index, interaction in enumerate(target_interactions):
        next_interaction = (
            target_interactions[index + 1]
            if index + 1 < len(target_interactions)
            else None
        )
        end_timestamp_ms = interaction.end_timestamp_ms
        if next_interaction is not None:
            end_timestamp_ms = min(
                end_timestamp_ms, next_interaction.click.timestamp_ms
            )
        capped_interactions.append(
            ToggleInteraction(
                click=interaction.click,
                end_timestamp_ms=end_timestamp_ms,
                pointerup_target_css_path=interaction.pointerup_target_css_path,
                pointerup_target_text=interaction.pointerup_target_text,
            ),
        )
    return capped_interactions


def summarize_interaction(
    interaction: ToggleInteraction,
    frame_gap_events: list[PerformanceEvent],
    longtask_events: list[PerformanceEvent],
    websocket_events: list[PerformanceEvent],
    gpu_frame_events: list[PerformanceEvent],
    backend_requests: list[BackendRequest],
) -> dict[str, Any]:
    start_ms = interaction.click.timestamp_ms
    end_ms = interaction.end_timestamp_ms
    frame_gaps = events_in_window(frame_gap_events, start_ms, end_ms)
    longtasks = events_in_window(longtask_events, start_ms, end_ms)
    websocket_messages = events_in_window(websocket_events, start_ms, end_ms)
    gpu_frames = events_in_window(gpu_frame_events, start_ms, end_ms)
    backend_window_requests = [
        request
        for request in backend_requests
        if start_ms <= request.completed_at_ms < end_ms
    ]
    websocket_summary = summarize_websocket_messages(websocket_messages)
    gpu_summary = summarize_gpu_frames(gpu_frames)
    backend_summary = summarize_backend_requests(backend_window_requests)
    return {
        "clickDurationMs": as_float(interaction.click.event.get("durationMs")),
        "endTimestampMs": round(end_ms, 3),
        "frameGapCount": len(frame_gaps),
        "frameGapMaxMs": max_event_number(frame_gaps, "gapMs"),
        "interactionId": interaction.click.event.get("interactionId"),
        "longTaskCount": len(longtasks),
        "longTaskMaxMs": max_event_number(longtasks, "durationMs"),
        "receivedAt": interaction.click.received_at,
        "sequenceNumber": interaction.click.sequence_number,
        "startTimestampMs": round(start_ms, 3),
        "targetCssPath": interaction.pointerup_target_css_path,
        "targetText": interaction.pointerup_target_text,
        "backend": backend_summary,
        "gpu": gpu_summary,
        "websocket": websocket_summary,
    }


def summarize_interactions(interactions: list[dict[str, Any]]) -> dict[str, Any]:
    project_update_durations = [
        interaction["websocket"]["messageTypes"]
        .get("UpdateFrontendProjectState", {})
        .get("durationMaxMs")
        for interaction in interactions
    ]
    project_update_handler_durations = [
        interaction["websocket"]["messageTypes"]
        .get("UpdateFrontendProjectState", {})
        .get("handlerMaxMs")
        for interaction in interactions
    ]
    project_update_payload_lengths = [
        interaction["websocket"]["messageTypes"]
        .get("UpdateFrontendProjectState", {})
        .get("rawTextLengthMax")
        for interaction in interactions
    ]
    project_param_update_handler_durations = [
        interaction["websocket"]["messageTypes"]
        .get("UpdateFrontendProjectParam", {})
        .get("handlerMaxMs")
        for interaction in interactions
    ]
    project_param_update_payload_lengths = [
        interaction["websocket"]["messageTypes"]
        .get("UpdateFrontendProjectParam", {})
        .get("rawTextLengthMax")
        for interaction in interactions
    ]
    set_param_durations = [
        interaction["backend"]["paths"]
        .get("/api/setParamEnteredValue", {})
        .get("maxMs")
        for interaction in interactions
    ]
    top_surfaces: Counter[str] = Counter()
    for interaction in interactions:
        for surface in interaction["gpu"]["topSurfacesByUploadedBytes"]:
            top_surfaces[surface["surfaceId"]] += int(surface["uploadedBytes"])
    return {
        "backendSetParamEnteredValueDurationMs": numeric_summary(set_param_durations),
        "clickDurationMs": numeric_summary(
            [interaction.get("clickDurationMs") for interaction in interactions]
        ),
        "frameGapCount": sum(
            int(interaction["frameGapCount"]) for interaction in interactions
        ),
        "frameGapMaxMs": numeric_summary(
            [interaction.get("frameGapMaxMs") for interaction in interactions]
        ),
        "gpuUploadedBytes": numeric_summary(
            [interaction["gpu"].get("uploadedBytes") for interaction in interactions]
        ),
        "interactionCount": len(interactions),
        "interactionsWithBackendSetParamEnteredValue": sum(
            1
            for interaction in interactions
            if "/api/setParamEnteredValue" in interaction["backend"]["paths"]
        ),
        "interactionsWithFrameGaps": sum(
            1 for interaction in interactions if interaction["frameGapCount"] > 0
        ),
        "interactionsWithLongTasks": sum(
            1 for interaction in interactions if interaction["longTaskCount"] > 0
        ),
        "longTaskCount": sum(
            int(interaction["longTaskCount"]) for interaction in interactions
        ),
        "longTaskMaxMs": numeric_summary(
            [interaction.get("longTaskMaxMs") for interaction in interactions]
        ),
        "projectStateUpdateDurationMs": numeric_summary(project_update_durations),
        "projectStateUpdateHandlerMs": numeric_summary(
            project_update_handler_durations
        ),
        "projectStateUpdateRawTextLength": numeric_summary(
            project_update_payload_lengths
        ),
        "projectParamUpdateHandlerMs": numeric_summary(
            project_param_update_handler_durations
        ),
        "projectParamUpdateRawTextLength": numeric_summary(
            project_param_update_payload_lengths
        ),
        "topGpuSurfacesByUploadedBytes": [
            {"surfaceId": surface_id, "uploadedBytes": uploaded_bytes}
            for surface_id, uploaded_bytes in top_surfaces.most_common(8)
        ],
    }


def summarize_websocket_messages(events: list[PerformanceEvent]) -> dict[str, Any]:
    by_type: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for event in events:
        payload = event.event.get("payload", {})
        message_type = payload.get("messageType")
        if isinstance(message_type, str):
            by_type[message_type].append(payload)

    message_types: dict[str, Any] = {}
    for message_type, payloads in sorted(by_type.items()):
        durations = [payload.get("durationMs") for payload in payloads]
        raw_lengths = [payload.get("rawTextLength") for payload in payloads]
        handler_durations = [
            phase.get("durationMs")
            for payload in payloads
            for phase in payload.get("phases", [])
            if phase.get("label") == "handler"
        ]
        message_types[message_type] = {
            "count": len(payloads),
            "durationMaxMs": max_number(durations),
            "durationSummaryMs": numeric_summary(durations),
            "handlerMaxMs": max_number(handler_durations),
            "handlerSummaryMs": numeric_summary(handler_durations),
            "rawTextLengthMax": max_number(raw_lengths),
            "rawTextLengthSummary": numeric_summary(raw_lengths),
        }
    return {
        "messageCount": len(events),
        "messageTypes": message_types,
    }


def summarize_gpu_frames(events: list[PerformanceEvent]) -> dict[str, Any]:
    uploaded_bytes = 0
    upload_diagnostic_count = 0
    source_rect_upload_count = 0
    full_or_unknown_upload_count = 0
    max_frame_duration_ms = 0.0
    max_upload_diagnostic_bytes = 0
    max_upload_diagnostic_duration_ms = 0.0
    surfaces: Counter[str] = Counter()
    for event in events:
        payload = event.event.get("payload", {})
        max_frame_duration_ms = max(
            max_frame_duration_ms,
            as_float(payload.get("durationMs")),
        )
        for diagnostic in payload.get("uploadDiagnostics", []):
            diagnostic_bytes = int(as_float(diagnostic.get("uploadedBytes")))
            diagnostic_duration = as_float(diagnostic.get("durationMs"))
            surface_id = diagnostic.get("surfaceId")
            uploaded_bytes += diagnostic_bytes
            upload_diagnostic_count += 1
            max_upload_diagnostic_bytes = max(
                max_upload_diagnostic_bytes,
                diagnostic_bytes,
            )
            max_upload_diagnostic_duration_ms = max(
                max_upload_diagnostic_duration_ms,
                diagnostic_duration,
            )
            if diagnostic.get("dirtySourceRect"):
                source_rect_upload_count += 1
            else:
                full_or_unknown_upload_count += 1
            if isinstance(surface_id, str):
                surfaces[surface_id] += diagnostic_bytes
    return {
        "frameCount": len(events),
        "fullOrUnknownUploadCount": full_or_unknown_upload_count,
        "maxFrameDurationMs": round(max_frame_duration_ms, 3),
        "maxUploadDiagnosticBytes": max_upload_diagnostic_bytes,
        "maxUploadDiagnosticDurationMs": round(max_upload_diagnostic_duration_ms, 3),
        "sourceRectUploadCount": source_rect_upload_count,
        "topSurfacesByUploadedBytes": [
            {"surfaceId": surface_id, "uploadedBytes": bytes_uploaded}
            for surface_id, bytes_uploaded in surfaces.most_common(5)
        ],
        "uploadDiagnosticCount": upload_diagnostic_count,
        "uploadedBytes": uploaded_bytes,
    }


def summarize_backend_requests(requests: list[BackendRequest]) -> dict[str, Any]:
    by_path: dict[str, list[BackendRequest]] = defaultdict(list)
    for request in requests:
        by_path[request.path].append(request)
    paths = {
        path: {
            "count": len(path_requests),
            "maxMs": round(max(request.duration_ms for request in path_requests), 3),
            "p95Ms": round(
                percentile([request.duration_ms for request in path_requests], 95),
                3,
            ),
        }
        for path, path_requests in sorted(by_path.items())
    }
    return {
        "requestCount": len(requests),
        "paths": paths,
    }


def render_markdown_report(report: dict[str, Any]) -> str:
    summary = report["summary"]
    lines = [
        "# Chrome Repro Toggle Jank Report",
        "",
        f"- Artifact: `{report['artifactDir']}`",
        f"- Recording events: `{report.get('eventCount')}`",
        f"- Created: `{report.get('createdAt')}`",
        f"- Finalized: `{report.get('finalizedAt')}`",
        f"- Target CSS substring: `{report['targetCssSubstring']}`",
        f"- Correlation window: `{format_number(report['windowMs'])}ms`, capped at the next target click",
        "",
        "## Summary",
        "",
        "| Metric | Value |",
        "| --- | ---: |",
        f"| Target interactions | {summary['interactionCount']} |",
        f"| Interactions with frame gaps | {summary['interactionsWithFrameGaps']} |",
        f"| Total frame gaps | {summary['frameGapCount']} |",
        f"| Max frame gap | {format_number(summary['frameGapMaxMs']['max'])}ms |",
        f"| Interactions with long tasks | {summary['interactionsWithLongTasks']} |",
        f"| Total long tasks | {summary['longTaskCount']} |",
        f"| Max long task | {format_number(summary['longTaskMaxMs']['max'])}ms |",
        f"| Max project-state websocket handler | {format_number(summary['projectStateUpdateHandlerMs']['max'])}ms |",
        f"| Max project-state websocket payload | {format_bytes(summary['projectStateUpdateRawTextLength']['max'])} |",
        f"| Max project-param websocket handler | {format_number(summary['projectParamUpdateHandlerMs']['max'])}ms |",
        f"| Max project-param websocket payload | {format_bytes(summary['projectParamUpdateRawTextLength']['max'])} |",
        f"| Max `/api/setParamEnteredValue` duration | {format_number(summary['backendSetParamEnteredValueDurationMs']['max'])}ms |",
        f"| Max GPU bytes uploaded per interaction | {format_bytes(summary['gpuUploadedBytes']['max'])} |",
        "",
        "## Top Interactions",
        "",
        "| Time | Click ms | Max gap ms | Max long task ms | Project handler ms | Project payload | Param handler ms | Param payload | Set param ms | GPU upload |",
        "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ]
    for interaction in top_interactions(report["interactions"]):
        project = interaction["websocket"]["messageTypes"].get(
            "UpdateFrontendProjectState",
            {},
        )
        project_param = interaction["websocket"]["messageTypes"].get(
            "UpdateFrontendProjectParam",
            {},
        )
        set_param = interaction["backend"]["paths"].get(
            "/api/setParamEnteredValue",
            {},
        )
        lines.append(
            "| "
            + " | ".join(
                [
                    interaction["receivedAt"].split("T")[-1].replace("Z", ""),
                    format_number(interaction["clickDurationMs"]),
                    format_number(interaction["frameGapMaxMs"]),
                    format_number(interaction["longTaskMaxMs"]),
                    format_number(project.get("handlerMaxMs", 0)),
                    format_bytes(project.get("rawTextLengthMax", 0)),
                    format_number(project_param.get("handlerMaxMs", 0)),
                    format_bytes(project_param.get("rawTextLengthMax", 0)),
                    format_number(set_param.get("maxMs", 0)),
                    format_bytes(interaction["gpu"]["uploadedBytes"]),
                ]
            )
            + " |"
        )
    lines.extend(
        [
            "",
            "## Top GPU Surfaces",
            "",
            "| Surface | Uploaded bytes across target windows |",
            "| --- | ---: |",
        ]
    )
    for surface in summary["topGpuSurfacesByUploadedBytes"]:
        lines.append(
            f"| `{surface['surfaceId']}` | {format_bytes(surface['uploadedBytes'])} |"
        )
    lines.extend(
        [
            "",
            "## Notes",
            "",
            "- Frame gaps come from `performance-frame-gap` events in the Chrome recording.",
            "- Websocket numbers come from `perf-websocket-message` app-state events.",
            "- Backend request durations come from `logs/backend.log`; duration units are converted from nanoseconds to milliseconds.",
            "- GPU upload bytes come from `gpu-flow-frame.uploadDiagnostics` and include only diagnostics captured in the recording payload.",
            "",
        ]
    )
    return "\n".join(lines)


def top_interactions(interactions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def severity(interaction: dict[str, Any]) -> float:
        project = interaction["websocket"]["messageTypes"].get(
            "UpdateFrontendProjectState",
            {},
        )
        project_param = interaction["websocket"]["messageTypes"].get(
            "UpdateFrontendProjectParam",
            {},
        )
        set_param = interaction["backend"]["paths"].get(
            "/api/setParamEnteredValue",
            {},
        )
        return max(
            as_float(interaction.get("frameGapMaxMs")),
            as_float(interaction.get("longTaskMaxMs")),
            as_float(project.get("handlerMaxMs")),
            as_float(project_param.get("handlerMaxMs")),
            as_float(set_param.get("maxMs")),
        )

    return sorted(interactions, key=severity, reverse=True)[:12]


def events_in_window(
    events: list[PerformanceEvent],
    start_ms: float,
    end_ms: float,
) -> list[PerformanceEvent]:
    return [event for event in events if start_ms <= event.timestamp_ms < end_ms]


def max_event_number(events: list[PerformanceEvent], field_name: str) -> float:
    return max_number([event.event.get(field_name) for event in events])


def max_number(values: list[Any]) -> float:
    finite_values = [
        as_float(value) for value in values if math.isfinite(as_float(value))
    ]
    return round(max(finite_values), 3) if finite_values else 0.0


def numeric_summary(values: list[Any]) -> dict[str, float | int]:
    finite_values = [
        as_float(value) for value in values if math.isfinite(as_float(value))
    ]
    if not finite_values:
        return {"avg": 0.0, "count": 0, "max": 0.0, "median": 0.0, "p95": 0.0}
    return {
        "avg": round(sum(finite_values) / len(finite_values), 3),
        "count": len(finite_values),
        "max": round(max(finite_values), 3),
        "median": round(percentile(finite_values, 50), 3),
        "p95": round(percentile(finite_values, 95), 3),
    }


def percentile(values: list[float], percentile_value: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    index = max(
        0,
        min(
            len(sorted_values) - 1,
            math.ceil((percentile_value / 100) * len(sorted_values)) - 1,
        ),
    )
    return sorted_values[index]


def as_float(value: Any) -> float:
    if isinstance(value, bool):
        return 0.0
    if isinstance(value, int | float):
        return float(value)
    return 0.0


def target_css_path_for_event(event: dict[str, Any]) -> str:
    target = event.get("target")
    if not isinstance(target, dict):
        return ""
    css_path = target.get("cssPath")
    return css_path if isinstance(css_path, str) else ""


def target_text_for_event(event: dict[str, Any]) -> str:
    target = event.get("target")
    if not isinstance(target, dict):
        return ""
    text = target.get("text")
    return text if isinstance(text, str) else ""


def to_performance_event(row: dict[str, Any]) -> PerformanceEvent:
    event = row.get("event", {})
    timestamp_ms = as_float(event.get("timestampMs"))
    return PerformanceEvent(
        sequence_number=int(as_float(row.get("sequenceNumber"))),
        received_at=str(row.get("receivedAt") or ""),
        timestamp_ms=timestamp_ms,
        event=event if isinstance(event, dict) else {},
    )


def read_backend_requests(path: Path) -> list[BackendRequest]:
    if not path.is_file():
        return []
    requests: list[BackendRequest] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        payload = parse_log_json_line(line)
        if not payload:
            continue
        timestamp = parse_datetime_ms(payload.get("time"))
        duration_ns = payload.get("duration")
        path_value = payload.get("path")
        method = payload.get("method")
        if (
            timestamp is None
            or not isinstance(duration_ns, int | float)
            or not isinstance(path_value, str)
            or not isinstance(method, str)
        ):
            continue
        duration_ms = float(duration_ns) / NANOSECONDS_PER_MILLISECOND
        requests.append(
            BackendRequest(
                completed_at_ms=timestamp,
                duration_ms=duration_ms,
                method=method,
                path=path_value,
                started_at_ms=timestamp - duration_ms,
                status=(
                    payload.get("status")
                    if isinstance(payload.get("status"), int)
                    else None
                ),
            ),
        )
    return requests


def parse_log_json_line(line: str) -> dict[str, Any]:
    json_start = line.find("{")
    if json_start < 0:
        return {}
    try:
        payload = json.loads(line[json_start:])
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def parse_datetime_ms(value: Any) -> float | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.strip()
    if normalized.endswith("Z"):
        normalized = normalized[:-1] + "+00:00"
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp() * 1000


def read_ndjson(path: Path) -> list[dict[str, Any]]:
    if not path.is_file():
        return []
    rows: list[dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            payload = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(payload, dict):
            rows.append(payload)
    return rows


def load_json_object(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def format_number(value: Any) -> str:
    number = as_float(value)
    if abs(number - round(number)) < 0.05:
        return str(int(round(number)))
    return f"{number:.1f}"


def format_bytes(value: Any) -> str:
    byte_count = as_float(value)
    if byte_count <= 0:
        return "0 B"
    mib = byte_count / (1024 * 1024)
    if mib >= 0.1:
        return f"{mib:.2f} MiB"
    kib = byte_count / 1024
    if kib >= 1:
        return f"{kib:.1f} KiB"
    return f"{int(byte_count)} B"


if __name__ == "__main__":
    sys.exit(main())
