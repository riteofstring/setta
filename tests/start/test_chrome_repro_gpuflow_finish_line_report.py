import json
import subprocess
import sys
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
        app_state_rows=[finish_line_marker(sequence_number=1, timestamp_ms=1_000)],
        performance_rows=[
            longtask_event(sequence_number=2, timestamp_ms=900, duration_ms=75),
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
    assert report["summary"]["longtaskCount"] == 0
    assert report["failures"]["browserLongTaskCount"] == 0
    assert report["failures"]["finishLineMarkerMissingCount"] == 0


def test_finish_line_report_fails_raw_browser_long_tasks(tmp_path: Path) -> None:
    module = _load_finish_line_report_module()
    artifact_dir = create_recording(
        tmp_path,
        app_state_rows=[finish_line_marker(sequence_number=1, timestamp_ms=1_000)],
        performance_rows=[
            longtask_event(sequence_number=2, timestamp_ms=1_100, duration_ms=75),
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
    assert report["failures"]["longTaskCount"] == 1
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


def finish_line_marker(sequence_number: int, timestamp_ms: int) -> dict:
    return app_state_event(
        sequence_number,
        timestamp_ms,
        "gpu-flow-finish-line-marker",
        {"name": "finish-line-start"},
    )


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


def write_ndjson(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "\n".join(json.dumps(row) for row in rows) + ("\n" if rows else ""),
        encoding="utf-8",
    )
