import base64
import json
import struct
import subprocess
import sys
import zlib
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType

from tests.start.dev_script_wiring_helpers import repo_root


def _load_finish_line_report_module() -> ModuleType:
    script_path = repo_root() / "scripts" / "chrome_repro_gpuflow_finish_line_report.py"
    spec = spec_from_file_location(
        "chrome_repro_gpuflow_finish_line_report", script_path
    )
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_finish_line_report_fails_markerless_recording(tmp_path: Path) -> None:
    artifact_dir = create_recording(tmp_path, app_state_rows=[], performance_rows=[])
    script_path = repo_root() / "scripts" / "chrome_repro_gpuflow_finish_line_report.py"

    completed = subprocess.run(
        [
            sys.executable,
            str(script_path),
            "--artifact-dir",
            str(artifact_dir),
            "--json",
        ],
        check=False,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    assert completed.returncode == 1
    report = json.loads(completed.stdout)
    assert report["analysisWindowKind"] == "full-recording-marker-missing"
    assert report["incompleteRecording"] is True
    assert report["failures"]["finishLineMarkerMissingCount"] == 1


def test_finish_line_report_filters_to_finish_line_marker(tmp_path: Path) -> None:
    module = _load_finish_line_report_module()
    artifact_dir = create_recording(
        tmp_path,
        app_state_rows=[
            gpu_flow_frame(
                sequence_number=1,
                timestamp_ms=900,
                frame=content_frame(frame_id=1),
            ),
            finish_line_marker(sequence_number=2, timestamp_ms=1_000),
            gpu_flow_frame(
                sequence_number=3,
                timestamp_ms=1_020,
                frame=content_frame(frame_id=2),
            ),
            gpu_flow_frame(
                sequence_number=4,
                timestamp_ms=1_040,
                frame=motion_projection_frame(frame_id=3),
            ),
        ],
        performance_rows=[
            longtask_event(sequence_number=5, timestamp_ms=900, duration_ms=75),
        ],
    )

    report = module.analyze_recording(
        artifact_dir=artifact_dir,
        budgets={
            "maxHeldPreviousMs": 120,
            "maxLongTaskMs": 50,
            "settleUploadBudgetBytes": 8 * 1024 * 1024,
            "settleWindowMs": 1000,
        },
    )

    assert report["analysisWindowKind"] == "finish-line-marker"
    assert report["analysisStartTimestampMs"] == 1_000
    assert report["summary"]["frameCount"] == 2
    assert report["summary"]["longtaskCount"] == 0
    assert report["failures"]["browserLongTaskCount"] == 0
    assert report["failures"]["finishLineMarkerMissingCount"] == 0
    assert report["failures"]["finishLineWindowIncompleteCount"] == 0


def test_finish_line_report_fails_empty_finish_line_window(
    tmp_path: Path,
) -> None:
    module = _load_finish_line_report_module()
    artifact_dir = create_recording(
        tmp_path,
        app_state_rows=[finish_line_marker(sequence_number=1, timestamp_ms=1_000)],
        performance_rows=[],
    )

    report = module.analyze_recording(
        artifact_dir=artifact_dir,
        budgets={
            "maxHeldPreviousMs": 120,
            "maxLongTaskMs": 50,
            "settleUploadBudgetBytes": 8 * 1024 * 1024,
            "settleWindowMs": 1000,
        },
    )

    assert report["summary"]["frameCount"] == 0
    assert report["incompleteRecording"] is False
    assert report["failures"]["finishLineMarkerMissingCount"] == 0
    assert report["failures"]["finishLineWindowIncompleteCount"] == 1
    assert report["details"]["finishLineCompleteness"]["missingReasons"] == [
        "no-gpu-flow-frames-after-marker",
        "no-content-frames-after-marker",
        "no-motion-projection-frames-after-marker",
        "no-interaction-active-frames-after-marker",
    ]


def test_finish_line_report_fails_raw_browser_long_tasks(tmp_path: Path) -> None:
    module = _load_finish_line_report_module()
    artifact_dir = create_recording(
        tmp_path,
        app_state_rows=[
            finish_line_marker(sequence_number=1, timestamp_ms=1_000),
            gpu_flow_frame(
                sequence_number=2,
                timestamp_ms=1_020,
                frame=content_frame(frame_id=1),
            ),
            gpu_flow_frame(
                sequence_number=3,
                timestamp_ms=1_040,
                frame=motion_projection_frame(frame_id=2),
            ),
        ],
        performance_rows=[
            longtask_event(sequence_number=4, timestamp_ms=1_100, duration_ms=75),
        ],
    )

    report = module.analyze_recording(
        artifact_dir=artifact_dir,
        budgets={
            "maxHeldPreviousMs": 120,
            "maxLongTaskMs": 50,
            "settleUploadBudgetBytes": 8 * 1024 * 1024,
            "settleWindowMs": 1000,
        },
    )

    assert report["summary"]["longtaskCount"] == 1
    assert report["failures"]["browserLongTaskCount"] == 1
    assert report["failures"]["finishLineWindowIncompleteCount"] == 0
    assert report["failures"]["longTaskCount"] == 1
    assert report["failureCount"] > 0


def test_finish_line_report_requires_browser_visual_evidence(
    tmp_path: Path,
) -> None:
    module = _load_finish_line_report_module()
    artifact_dir = create_recording(
        tmp_path,
        app_state_rows=[
            finish_line_marker(sequence_number=1, timestamp_ms=1_000),
            gpu_flow_frame(
                sequence_number=2,
                timestamp_ms=1_020,
                frame=content_frame(frame_id=1),
            ),
            gpu_flow_frame(
                sequence_number=3,
                timestamp_ms=1_040,
                frame=motion_projection_frame(frame_id=2),
            ),
        ],
        performance_rows=[],
    )

    report = module.analyze_recording(
        artifact_dir=artifact_dir,
        budgets=default_budgets(),
    )

    assert report["failures"]["visualEvidenceMissingCount"] == 1
    assert report["failureCount"] > 0


def test_finish_line_report_accepts_alternative_nonblank_clip_raster(
    tmp_path: Path,
) -> None:
    module = _load_finish_line_report_module()
    artifact_dir = create_recording(
        tmp_path,
        app_state_rows=[
            finish_line_marker(sequence_number=1, timestamp_ms=1_000),
            browser_visual_evidence_event(
                sequence_number=2,
                timestamp_ms=1_010,
                raster_data_url=png_data_url(nonblank=True),
            ),
            gpu_flow_frame(
                sequence_number=3,
                timestamp_ms=1_020,
                frame=content_frame(frame_id=1),
            ),
            gpu_flow_frame(
                sequence_number=4,
                timestamp_ms=1_040,
                frame=motion_projection_frame(frame_id=2),
            ),
        ],
        performance_rows=[],
    )

    report = module.analyze_recording(
        artifact_dir=artifact_dir,
        budgets=default_budgets(),
    )

    assert report["details"]["visualEvidence"]["pixelSourceCount"] == 1
    assert report["details"]["visualEvidence"]["screenshotCount"] == 0
    assert report["failures"]["visualEvidenceBlankTextClipCount"] == 0
    assert report["failures"]["visualEvidenceScreenshotMissingCount"] == 0
    assert report["failures"]["visualEvidenceTextClipMissingCount"] == 0
    assert report["failureCount"] == 0


def test_finish_line_report_fails_blank_browser_visual_text_clip(
    tmp_path: Path,
) -> None:
    module = _load_finish_line_report_module()
    artifact_dir = create_recording(
        tmp_path,
        app_state_rows=[
            finish_line_marker(sequence_number=1, timestamp_ms=1_000),
            browser_visual_evidence_event(
                sequence_number=2,
                timestamp_ms=1_010,
                raster_data_url=png_data_url(nonblank=False),
            ),
            gpu_flow_frame(
                sequence_number=3,
                timestamp_ms=1_020,
                frame=content_frame(frame_id=1),
            ),
            gpu_flow_frame(
                sequence_number=4,
                timestamp_ms=1_040,
                frame=motion_projection_frame(frame_id=2),
            ),
        ],
        performance_rows=[],
    )

    report = module.analyze_recording(
        artifact_dir=artifact_dir,
        budgets=default_budgets(),
    )

    assert report["failures"]["visualEvidenceBlankTextClipCount"] == 1
    assert report["details"]["visualEvidence"]["blankTextClips"][0]["rowId"] == (
        "row-a"
    )
    assert report["failureCount"] > 0


def create_recording(
    tmp_path: Path,
    *,
    app_state_rows: list[dict],
    performance_rows: list[dict],
) -> Path:
    artifact_dir = tmp_path / "recording"
    artifact_dir.mkdir()
    (artifact_dir / "session.json").write_text(
        json.dumps(
            {
                "createdAt": "1970-01-01T00:00:00+00:00",
                "finalizedAt": "1970-01-01T00:00:02+00:00",
            },
        ),
        encoding="utf-8",
    )
    write_ndjson(artifact_dir / "app_state.ndjson", app_state_rows)
    write_ndjson(artifact_dir / "performance.ndjson", performance_rows)
    return artifact_dir


def default_budgets() -> dict:
    return {
        "maxHeldPreviousMs": 120,
        "maxLongTaskMs": 50,
        "settleUploadBudgetBytes": 8 * 1024 * 1024,
        "settleWindowMs": 1000,
    }


def finish_line_marker(sequence_number: int, timestamp_ms: int) -> dict:
    return app_state_event(
        sequence_number,
        timestamp_ms,
        "gpu-flow-finish-line-marker",
        {"name": "finish-line-start"},
    )


def gpu_flow_frame(sequence_number: int, timestamp_ms: int, frame: dict) -> dict:
    return app_state_event(
        sequence_number,
        timestamp_ms,
        "gpu-flow-frame",
        frame,
    )


def browser_visual_evidence_event(
    sequence_number: int,
    timestamp_ms: int,
    raster_data_url: str,
) -> dict:
    return app_state_event(
        sequence_number,
        timestamp_ms,
        "gpu-flow-browser-visual-evidence",
        {
            "alternativePixelSource": "clip-raster",
            "clips": [
                {
                    "active": False,
                    "clip": {"height": 4, "width": 12, "x": 0, "y": 0},
                    "coverageState": "live",
                    "expectedTextLength": 5,
                    "raster": {
                        "dataUrl": raster_data_url,
                        "height": 4,
                        "source": "test-raster",
                        "width": 12,
                    },
                    "rowId": "row-a",
                    "sourceId": "source-a",
                    "surfaceId": "surface-a",
                }
            ],
            "devicePixelRatio": 1,
            "evidenceId": "evidence-a",
            "hostCount": 1,
            "triggerKind": "test",
            "viewport": {"height": 4, "width": 12},
            "visibleHostCount": 1,
            "visibleNonemptyHostCount": 1,
        },
    )


def content_frame(frame_id: int) -> dict:
    return {
        "frame": frame_id,
        "frameReasons": ["settings-open"],
        "phaseDiagnostics": {"frameMode": "content"},
        "projectionDiagnostics": {},
        "retainedTexturePageTransactionOutcome": "publish-exact",
    }


def motion_projection_frame(frame_id: int) -> dict:
    return {
        "deferResolutionUpdates": True,
        "frame": frame_id,
        "frameReasons": ["viewport"],
        "phaseDiagnostics": {"frameMode": "projection"},
        "projectionDiagnostics": {"lane": "motion"},
        "retainedTexturePageTransactionOutcome": "none",
    }


def app_state_event(
    sequence_number: int,
    timestamp_ms: int,
    kind: str,
    payload: dict,
) -> dict:
    return {
        "sequenceNumber": sequence_number,
        "receivedAt": f"1970-01-01T00:00:01.{sequence_number:03d}Z",
        "event": {
            "type": "app-state",
            "timestampMs": timestamp_ms,
            "kind": kind,
            "payload": payload,
        },
    }


def longtask_event(sequence_number: int, timestamp_ms: int, duration_ms: int) -> dict:
    return {
        "sequenceNumber": sequence_number,
        "receivedAt": f"1970-01-01T00:00:01.{sequence_number:03d}Z",
        "event": {
            "type": "performance-longtask",
            "durationMs": duration_ms,
            "name": "self",
            "startTimeMs": timestamp_ms,
            "timestampMs": timestamp_ms,
        },
    }


def png_data_url(*, nonblank: bool) -> str:
    width = 12
    height = 4
    pixels = bytearray()
    for y in range(height):
        pixels.append(0)
        for x in range(width):
            ink = nonblank and 2 <= x <= 9 and 1 <= y <= 2
            pixels.extend((0, 0, 0, 255) if ink else (255, 255, 255, 255))
    payload = png_chunk(
        b"IHDR",
        struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0),
    )
    payload += png_chunk(b"IDAT", zlib.compress(bytes(pixels)))
    payload += png_chunk(b"IEND", b"")
    encoded = base64.b64encode(b"\x89PNG\r\n\x1a\n" + payload).decode("ascii")
    return f"data:image/png;base64,{encoded}"


def png_chunk(kind: bytes, data: bytes) -> bytes:
    return (
        struct.pack(">I", len(data))
        + kind
        + data
        + struct.pack(">I", zlib.crc32(kind + data) & 0xFFFFFFFF)
    )


def write_ndjson(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "\n".join(json.dumps(row) for row in rows) + ("\n" if rows else ""),
        encoding="utf-8",
    )
