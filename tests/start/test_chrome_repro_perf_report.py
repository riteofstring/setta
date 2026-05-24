import json
import sys
from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
from types import ModuleType

from tests.start.dev_script_wiring_helpers import repo_root


def _load_chrome_repro_perf_report_module() -> ModuleType:
    script_path = repo_root() / "scripts" / "chrome_repro_perf_report.py"
    spec = spec_from_file_location("chrome_repro_perf_report_script", script_path)
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def test_chrome_repro_perf_report_summarizes_toggle_jank(tmp_path: Path) -> None:
    module = _load_chrome_repro_perf_report_module()
    artifact_dir = tmp_path / "recording"
    logs_dir = artifact_dir / "logs"
    logs_dir.mkdir(parents=True)
    (artifact_dir / "session.json").write_text(
        json.dumps(
            {
                "createdAt": "1970-01-01T00:00:00+00:00",
                "eventCount": 8,
                "finalizedAt": "1970-01-01T00:00:02+00:00",
            },
        ),
        encoding="utf-8",
    )
    write_ndjson(
        artifact_dir / "performance.ndjson",
        [
            performance_event(
                1,
                1000,
                "pointerup",
                interaction_id=42,
                target_css=(
                    "#ParamContainer-settings-section__gui-settings-codeobj__gui__gui__"
                    "leftSidePaneShiftsMap > div:nth-of-type(2) > button"
                ),
            ),
            performance_event(
                2,
                1000,
                "click",
                duration_ms=32,
                interaction_id=42,
                target_css="#root > canvas",
            ),
            {
                "sequenceNumber": 3,
                "receivedAt": "1970-01-01T00:00:01.100Z",
                "event": {
                    "type": "performance-frame-gap",
                    "timestampMs": 1100,
                    "gapMs": 66.7,
                },
            },
            {
                "sequenceNumber": 4,
                "receivedAt": "1970-01-01T00:00:01.120Z",
                "event": {
                    "type": "performance-longtask",
                    "timestampMs": 1120,
                    "durationMs": 80,
                },
            },
            performance_event(
                5,
                1500,
                "click",
                duration_ms=16,
                interaction_id=43,
                target_css="#root > button",
            ),
        ],
    )
    write_ndjson(
        artifact_dir / "app_state.ndjson",
        [
            app_state_event(
                6,
                1050,
                "perf-websocket-message",
                {
                    "messageType": "UpdateFrontendProjectState",
                    "rawTextLength": 1_350_000,
                    "durationMs": 23.4,
                    "phases": [
                        {"label": "json-parse", "durationMs": 1.4},
                        {"label": "handler", "durationMs": 21.6},
                    ],
                },
            ),
            app_state_event(
                7,
                1060,
                "perf-websocket-message",
                {
                    "messageType": "UpdateFrontendProjectParam",
                    "rawTextLength": 12_000,
                    "durationMs": 4.2,
                    "phases": [
                        {"label": "json-parse", "durationMs": 0.2},
                        {"label": "handler", "durationMs": 3.1},
                    ],
                },
            ),
            app_state_event(
                8,
                1070,
                "gpu-flow-frame",
                {
                    "durationMs": 1.2,
                    "uploadDiagnostics": [
                        {
                            "dirtySourceRect": {
                                "height": 10,
                                "width": 20,
                                "x": 4,
                                "y": 5,
                            },
                            "durationMs": 0.4,
                            "surfaceId": "settings-section__gui",
                            "uploadedBytes": 2048,
                        },
                    ],
                },
            ),
        ],
    )
    (logs_dir / "backend.log").write_text(
        "\n".join(
            [
                json.dumps(
                    {
                        "time": "1970-01-01T00:00:01.150+00:00",
                        "method": "POST",
                        "path": "/api/setParamEnteredValue",
                        "status": 200,
                        "duration": 150_000_000,
                    },
                ),
                json.dumps(
                    {
                        "time": "1970-01-01T00:00:01.950+00:00",
                        "method": "GET",
                        "path": "/ws/frontend",
                        "status": 101,
                        "duration": 2_000_000_000,
                    },
                ),
            ],
        ),
        encoding="utf-8",
    )

    report = module.analyze_recording(artifact_dir=artifact_dir, window_ms=900)

    assert report["summary"]["interactionCount"] == 1
    assert report["summary"]["frameGapCount"] == 1
    assert report["summary"]["longTaskCount"] == 1
    assert report["summary"]["frameGapMaxMs"]["max"] == 66.7
    assert report["summary"]["longTaskMaxMs"]["max"] == 80
    assert report["summary"]["projectStateUpdateHandlerMs"]["max"] == 21.6
    assert report["summary"]["projectStateUpdateRawTextLength"]["max"] == 1_350_000
    assert report["summary"]["projectParamUpdateHandlerMs"]["max"] == 3.1
    assert report["summary"]["projectParamUpdateRawTextLength"]["max"] == 12_000
    assert report["summary"]["backendSetParamEnteredValueDurationMs"]["max"] == 150
    assert report["summary"]["gpuUploadedBytes"]["max"] == 2048
    assert report["interactions"][0]["backend"]["paths"] == {
        "/api/setParamEnteredValue": {"count": 1, "maxMs": 150, "p95Ms": 150},
    }
    markdown = module.render_markdown_report(report)
    assert "Chrome Repro Toggle Jank Report" in markdown
    assert "1.29 MiB" in markdown


def performance_event(
    sequence_number: int,
    timestamp_ms: int,
    name: str,
    *,
    duration_ms: int = 0,
    interaction_id: int,
    target_css: str,
) -> dict:
    return {
        "sequenceNumber": sequence_number,
        "receivedAt": f"1970-01-01T00:00:01.{sequence_number:03d}Z",
        "event": {
            "type": "performance-event",
            "timestampMs": timestamp_ms,
            "name": name,
            "durationMs": duration_ms,
            "interactionId": interaction_id,
            "target": {
                "cssPath": target_css,
                "text": "",
            },
        },
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


def write_ndjson(path: Path, rows: list[dict]) -> None:
    path.write_text(
        "\n".join(json.dumps(row) for row in rows) + "\n",
        encoding="utf-8",
    )
