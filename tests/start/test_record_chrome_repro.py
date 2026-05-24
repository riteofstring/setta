import json
import signal
import subprocess
import sys
import urllib.request
from pathlib import Path

from tests.start.dev_script_wiring_helpers import (
    repo_root,
)


from tests.start.record_chrome_repro_helpers import (
    pick_free_port,
    wait_for_http_ok,
    load_chrome_repro_collector_module,
    load_collect_llm_artifacts_module,
)


def test_chrome_repro_collector_writes_recording_json_on_shutdown(
    tmp_path: Path,
) -> None:
    root = repo_root()
    artifact_dir = tmp_path / "collector-artifacts"
    port = pick_free_port()
    process = subprocess.Popen(
        [
            sys.executable,
            str(root / "scripts" / "chrome_repro_collector.py"),
            "--artifact-dir",
            str(artifact_dir),
            "--port",
            str(port),
        ],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_http_ok(f"http://127.0.0.1:{port}/health")
        payloads = [
            {"sequenceNumber": 1, "event": {"type": "navigation"}},
            {"sequenceNumber": 2, "event": {"type": "click"}},
        ]
        for payload in payloads:
            request = urllib.request.Request(
                f"http://127.0.0.1:{port}/event",
                method="POST",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=2) as response:
                assert response.status == 200
    finally:
        process.send_signal(signal.SIGTERM)
        stdout, stderr = process.communicate(timeout=10)
        assert process.returncode == 0, stdout + stderr

    recording_payload = json.loads(
        (artifact_dir / "recording.json").read_text(encoding="utf-8")
    )
    session_payload = json.loads(
        (artifact_dir / "session.json").read_text(encoding="utf-8")
    )
    events_lines = (
        (artifact_dir / "events.ndjson").read_text(encoding="utf-8").splitlines()
    )

    assert recording_payload["format"] == "setta.chrome-repro-recorder/v1"
    assert recording_payload["eventCount"] == 2
    assert [event["event"]["type"] for event in recording_payload["events"]] == [
        "navigation",
        "click",
    ]
    assert session_payload["eventCount"] == 2
    assert len(events_lines) == 2


def test_split_transport_details_keeps_transport_events_without_detail_fields() -> None:
    module = load_chrome_repro_collector_module()
    payload = {
        "sequenceNumber": 9,
        "event": {"type": "network-response", "status": 204},
    }

    normalized_payload, detail_payload = module.split_transport_details(payload)

    assert normalized_payload == payload
    assert detail_payload is None


def test_chrome_repro_collector_writes_split_runtime_artifacts(tmp_path: Path) -> None:
    root = repo_root()
    artifact_dir = tmp_path / "collector-artifacts"
    port = pick_free_port()
    process = subprocess.Popen(
        [
            sys.executable,
            str(root / "scripts" / "chrome_repro_collector.py"),
            "--artifact-dir",
            str(artifact_dir),
            "--port",
            str(port),
        ],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_http_ok(f"http://127.0.0.1:{port}/health")
        payloads = [
            {"sequenceNumber": 1, "event": {"type": "console", "level": "error"}},
            {
                "sequenceNumber": 2,
                "event": {"type": "network-response", "status": 500},
            },
            {
                "sequenceNumber": 3,
                "event": {"type": "websocket-message", "direction": "recv"},
            },
            {
                "sequenceNumber": 4,
                "event": {"type": "app-state", "kind": "lsp-diagnostics"},
            },
            {
                "sequenceNumber": 5,
                "event": {"type": "performance-frame-gap", "gapMs": 48},
            },
            {
                "sequenceNumber": 6,
                "event": {"type": "app-state", "kind": "gpu-flow-frame"},
            },
            {
                "sequenceNumber": 7,
                "event": {"type": "app-state", "kind": "perf-websocket-message"},
            },
            {"sequenceNumber": 8, "event": {"type": "click"}},
        ]
        for payload in payloads:
            request = urllib.request.Request(
                f"http://127.0.0.1:{port}/event",
                method="POST",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )
            with urllib.request.urlopen(request, timeout=2) as response:
                assert response.status == 200
    finally:
        process.send_signal(signal.SIGTERM)
        stdout, stderr = process.communicate(timeout=10)
        assert process.returncode == 0, stdout + stderr

    session_payload = json.loads(
        (artifact_dir / "session.json").read_text(encoding="utf-8")
    )
    console_lines = (
        (artifact_dir / "console.ndjson").read_text(encoding="utf-8").splitlines()
    )
    transport_lines = (
        (artifact_dir / "transport.ndjson").read_text(encoding="utf-8").splitlines()
    )
    transport_detail_lines = (
        (artifact_dir / "transport_details.ndjson")
        .read_text(encoding="utf-8")
        .splitlines()
    )
    app_state_lines = (
        (artifact_dir / "app_state.ndjson").read_text(encoding="utf-8").splitlines()
    )
    performance_lines = (
        (artifact_dir / "performance.ndjson").read_text(encoding="utf-8").splitlines()
    )

    assert session_payload["eventCountsByType"] == {
        "app-state": 3,
        "click": 1,
        "console": 1,
        "network-response": 1,
        "performance-frame-gap": 1,
        "websocket-message": 1,
    }
    assert session_payload["consoleEventsFile"].endswith("console.ndjson")
    assert session_payload["transportEventsFile"].endswith("transport.ndjson")
    assert session_payload["transportDetailsFile"].endswith("transport_details.ndjson")
    assert session_payload["appStateEventsFile"].endswith("app_state.ndjson")
    assert session_payload["performanceEventsFile"].endswith("performance.ndjson")
    assert [json.loads(line)["event"]["type"] for line in console_lines] == ["console"]
    assert [json.loads(line)["event"]["type"] for line in transport_lines] == [
        "network-response",
        "websocket-message",
    ]
    assert transport_detail_lines == []
    assert [json.loads(line)["event"]["type"] for line in app_state_lines] == [
        "app-state",
        "app-state",
        "app-state",
    ]
    assert [json.loads(line)["event"]["type"] for line in performance_lines] == [
        "performance-frame-gap",
        "app-state",
        "app-state",
    ]


def test_chrome_repro_collector_splits_transport_details_into_sidecar(
    tmp_path: Path,
) -> None:
    root = repo_root()
    artifact_dir = tmp_path / "collector-artifacts"
    port = pick_free_port()
    process = subprocess.Popen(
        [
            sys.executable,
            str(root / "scripts" / "chrome_repro_collector.py"),
            "--artifact-dir",
            str(artifact_dir),
            "--port",
            str(port),
        ],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_http_ok(f"http://127.0.0.1:{port}/health")
        payload = {
            "sequenceNumber": 7,
            "event": {
                "type": "websocket-message",
                "socketId": "ws-1",
                "direction": "recv",
                "kind": "text",
                "preview": '{"messageType":"LSPDiagnostics"}',
                "detailText": '{"messageType":"LSPDiagnostics","content":{"projectConfigId":"project-alpha"}}',
                "detailJson": {
                    "messageType": "LSPDiagnostics",
                    "content": {"projectConfigId": "project-alpha"},
                },
            },
        }
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/event",
            method="POST",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=2) as response:
            assert response.status == 200
    finally:
        process.send_signal(signal.SIGTERM)
        stdout, stderr = process.communicate(timeout=10)
        assert process.returncode == 0, stdout + stderr

    transport_payload = json.loads(
        (artifact_dir / "transport.ndjson").read_text(encoding="utf-8").splitlines()[0]
    )
    transport_detail_payload = json.loads(
        (artifact_dir / "transport_details.ndjson")
        .read_text(encoding="utf-8")
        .splitlines()[0]
    )

    assert "detailText" not in transport_payload["event"]
    assert "detailJson" not in transport_payload["event"]
    assert transport_detail_payload["sequenceNumber"] == 7
    assert transport_detail_payload["event"]["socketId"] == "ws-1"
    assert transport_detail_payload["event"]["detailText"].startswith(
        '{"messageType":"LSPDiagnostics"'
    )
    assert transport_detail_payload["event"]["detailJson"]["messageType"] == (
        "LSPDiagnostics"
    )


def test_chrome_repro_collector_splits_network_response_body_details_into_sidecar(
    tmp_path: Path,
) -> None:
    root = repo_root()
    artifact_dir = tmp_path / "collector-artifacts"
    port = pick_free_port()
    process = subprocess.Popen(
        [
            sys.executable,
            str(root / "scripts" / "chrome_repro_collector.py"),
            "--artifact-dir",
            str(artifact_dir),
            "--port",
            str(port),
        ],
        cwd=root,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    try:
        wait_for_http_ok(f"http://127.0.0.1:{port}/health")
        payload = {
            "sequenceNumber": 8,
            "event": {
                "type": "network-response",
                "requestId": "fetch-1",
                "transport": "fetch",
                "method": "POST",
                "url": "http://127.0.0.1:8019/api/mcpServerRuntimeStatus",
                "status": 200,
                "body": {"externalServers": [{"serverId": "setta"}]},
                "detailBodyText": '{"externalServers":[{"serverId":"setta","state":"unknown"}]}',
                "detailBodyJson": {
                    "externalServers": [{"serverId": "setta", "state": "unknown"}]
                },
            },
        }
        request = urllib.request.Request(
            f"http://127.0.0.1:{port}/event",
            method="POST",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(request, timeout=2) as response:
            assert response.status == 200
    finally:
        process.send_signal(signal.SIGTERM)
        stdout, stderr = process.communicate(timeout=10)
        assert process.returncode == 0, stdout + stderr

    transport_payload = json.loads(
        (artifact_dir / "transport.ndjson").read_text(encoding="utf-8").splitlines()[0]
    )
    transport_detail_payload = json.loads(
        (artifact_dir / "transport_details.ndjson")
        .read_text(encoding="utf-8")
        .splitlines()[0]
    )

    assert "detailBodyText" not in transport_payload["event"]
    assert "detailBodyJson" not in transport_payload["event"]
    assert transport_payload["event"]["body"] == {
        "externalServers": [{"serverId": "setta"}]
    }
    assert transport_detail_payload["event"]["requestId"] == "fetch-1"
    assert (
        transport_detail_payload["event"]["detailBodyJson"]["externalServers"][0][
            "state"
        ]
        == "unknown"
    )


def test_chrome_repro_collect_llm_artifacts_copies_redacted_external_agent_session(
    tmp_path: Path,
) -> None:
    root = repo_root()
    artifact_dir = tmp_path / "recording"
    setta_files_root = tmp_path / "setta_files"
    run_id = "run-123"
    chat_id = "chat-456"
    engine_config_id = "engine-789"
    external_agent_config_id = "external-codex"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    setta_files_root.mkdir(parents=True, exist_ok=True)

    transport_detail_payload = {
        "sequenceNumber": 11,
        "event": {
            "type": "websocket-message",
            "detailJson": {
                "messageType": "AgentRunUpdated",
                "content": {
                    "id": run_id,
                    "inputs": {
                        "runType": "external_agent",
                        "chatId": chat_id,
                        "engineConfigId": engine_config_id,
                    },
                    "outputs": {
                        "threadId": "thread-101",
                    },
                },
            },
        },
    }
    (artifact_dir / "transport_details.ndjson").write_text(
        json.dumps(transport_detail_payload) + "\n",
        encoding="utf-8",
    )
    (setta_files_root / "engine_configs.json").write_text(
        json.dumps(
            [
                {
                    "id": engine_config_id,
                    "name": "Codex",
                    "externalAgentConfigId": external_agent_config_id,
                    "api_token": "engine-secret",
                }
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    (setta_files_root / "external_agents.json").write_text(
        json.dumps(
            [
                {
                    "id": external_agent_config_id,
                    "name": "External Codex",
                    "toolType": "codex",
                    "cookie": "cookie-secret",
                }
            ]
        )
        + "\n",
        encoding="utf-8",
    )
    agent_runs_dir = setta_files_root / "agent_runs"
    agent_runs_dir.mkdir(parents=True, exist_ok=True)
    (agent_runs_dir / f"{run_id}.json").write_text(
        json.dumps(
            {
                "id": run_id,
                "outputs": {
                    "threadId": "thread-101",
                    "access_token": "run-secret",
                },
            }
        )
        + "\n",
        encoding="utf-8",
    )

    session_root = (
        setta_files_root
        / "external_agent_settings"
        / "codex"
        / external_agent_config_id
        / "sessions"
        / chat_id
    )
    (session_root / "log").mkdir(parents=True, exist_ok=True)
    (session_root / "sessions" / "2026" / "03" / "31").mkdir(
        parents=True, exist_ok=True
    )
    (session_root / "shell_snapshots").mkdir(parents=True, exist_ok=True)
    (session_root / "tmp").mkdir(parents=True, exist_ok=True)
    (session_root / "memories").mkdir(parents=True, exist_ok=True)
    (session_root / "config.toml").write_text(
        'model = "gpt-5.4"\n'
        'cookie = "session-cookie"\n'
        'authorization = "Bearer session-token"\n',
        encoding="utf-8",
    )
    (session_root / "log" / "codex.log").write_text("runtime ready\n", encoding="utf-8")
    (session_root / "sessions" / "2026" / "03" / "31" / "rollout.jsonl").write_text(
        json.dumps({"type": "response", "refresh_token": "rollout-secret"}) + "\n",
        encoding="utf-8",
    )
    (session_root / "auth.json").write_text(
        json.dumps({"access_token": "auth-secret"}) + "\n",
        encoding="utf-8",
    )
    (session_root / "logs_main.sqlite").write_text("sqlite", encoding="utf-8")
    (session_root / "state_main.sqlite-wal").write_text("sqlite", encoding="utf-8")
    (session_root / "shell_snapshots" / "snapshot.txt").write_text(
        "shell snapshot",
        encoding="utf-8",
    )
    (session_root / "tmp" / "tmp.txt").write_text("tmp", encoding="utf-8")
    (session_root / "memories" / "memory.txt").write_text("memory", encoding="utf-8")

    process = subprocess.run(
        [
            sys.executable,
            str(root / "scripts" / "chrome_repro_collect_llm_artifacts.py"),
            "--artifact-dir",
            str(artifact_dir),
            "--setta-files-root",
            str(setta_files_root),
        ],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert process.returncode == 0, process.stdout + process.stderr

    llm_artifacts_dir = artifact_dir / "llm_engine_artifacts"
    manifest = json.loads(
        (llm_artifacts_dir / "manifest.json").read_text(encoding="utf-8")
    )
    copied_run = manifest["copiedRuns"][0]
    copied_config_path = (
        llm_artifacts_dir
        / "external_agent_settings"
        / "codex"
        / external_agent_config_id
        / "sessions"
        / chat_id
        / "config.toml"
    )
    copied_rollout_path = (
        llm_artifacts_dir
        / "external_agent_settings"
        / "codex"
        / external_agent_config_id
        / "sessions"
        / chat_id
        / "sessions"
        / "2026"
        / "03"
        / "31"
        / "rollout.jsonl"
    )
    copied_run_payload = json.loads(
        (llm_artifacts_dir / "agent_runs" / f"{run_id}.json").read_text(
            encoding="utf-8"
        )
    )

    assert manifest["format"] == "setta.chrome-repro-llm-artifacts/v1"
    assert manifest["copiedRunCount"] == 1
    assert copied_run["runId"] == run_id
    assert copied_run["chatId"] == chat_id
    assert copied_run["engineConfig"]["api_token"] == "<redacted>"
    assert copied_run["externalAgentConfig"]["cookie"] == "<redacted>"
    assert copied_run_payload["outputs"]["access_token"] == "<redacted>"
    assert "cookie = '<redacted>'" in copied_config_path.read_text(encoding="utf-8")
    assert "authorization = '<redacted>'" in copied_config_path.read_text(
        encoding="utf-8"
    )
    assert "<redacted>" in copied_rollout_path.read_text(encoding="utf-8")
    assert not (
        llm_artifacts_dir
        / "external_agent_settings"
        / "codex"
        / external_agent_config_id
        / "sessions"
        / chat_id
        / "auth.json"
    ).exists()
    assert not list(llm_artifacts_dir.rglob("*.sqlite"))
    assert not list(llm_artifacts_dir.rglob("*.sqlite-wal"))
    assert not list(llm_artifacts_dir.rglob("shell_snapshots/*"))
    assert not list(llm_artifacts_dir.rglob("tmp/*"))
    assert not list(llm_artifacts_dir.rglob("memories/*"))


def test_write_sanitized_copy_falls_back_to_copy_for_invalid_json(
    tmp_path: Path,
) -> None:
    module = load_collect_llm_artifacts_module()
    source_path = tmp_path / "payload.json"
    destination_path = tmp_path / "copied" / "payload.json"
    source_path.write_text("{not valid json}\n", encoding="utf-8")

    module.write_sanitized_copy(source_path, destination_path)

    assert destination_path.read_text(encoding="utf-8") == "{not valid json}\n"


def test_write_sanitized_copy_sanitizes_jsonl_lines(tmp_path: Path) -> None:
    module = load_collect_llm_artifacts_module()
    source_path = tmp_path / "payload.jsonl"
    destination_path = tmp_path / "copied" / "payload.jsonl"
    source_path.write_text(
        "\n".join(
            [
                "",
                '{"message":"keep"}',
                "{not valid json}",
                '{"refresh_token":"secret"}',
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    module.write_sanitized_copy(source_path, destination_path)

    assert destination_path.read_text(encoding="utf-8").splitlines() == [
        '{"message": "keep"}',
        "{not valid json}",
        '{"refresh_token": "<redacted>"}',
    ]


def test_iter_json_object_lines_skips_blank_invalid_and_non_object_lines(
    tmp_path: Path,
) -> None:
    module = load_collect_llm_artifacts_module()
    source_path = tmp_path / "transport_details.ndjson"
    source_path.write_text(
        "\n".join(
            [
                "",
                "{not valid json}",
                '["not", "an", "object"]',
                '{"event":{"type":"websocket-message"}}',
                "{}",
            ]
        )
        + "\n",
        encoding="utf-8",
    )

    assert list(module.iter_json_object_lines(source_path)) == [
        {"event": {"type": "websocket-message"}},
        {},
    ]
    assert list(module.iter_json_object_lines(tmp_path / "missing.ndjson")) == []


def test_iter_safe_session_source_paths_only_returns_allowlisted_files(
    tmp_path: Path,
) -> None:
    module = load_collect_llm_artifacts_module()
    session_root = tmp_path / "session"
    (session_root / "log" / "nested").mkdir(parents=True, exist_ok=True)
    (session_root / "sessions" / "2026" / "04" / "09").mkdir(
        parents=True, exist_ok=True
    )
    (session_root / "tmp").mkdir(parents=True, exist_ok=True)
    (session_root / "memories").mkdir(parents=True, exist_ok=True)

    (session_root / "config.toml").write_text('model = "gpt-5.4"\n', encoding="utf-8")
    (session_root / "log" / "listener.log").write_text("started\n", encoding="utf-8")
    (session_root / "log" / "nested" / "worker.log").write_text(
        "worker\n", encoding="utf-8"
    )
    (session_root / "sessions" / "2026" / "04" / "09" / "a.jsonl").write_text(
        '{"message":"a"}\n',
        encoding="utf-8",
    )
    (session_root / "sessions" / "2026" / "04" / "09" / "z.jsonl").write_text(
        '{"message":"z"}\n',
        encoding="utf-8",
    )
    (session_root / "sessions" / "2026" / "04" / "09" / "ignored.txt").write_text(
        "ignored\n",
        encoding="utf-8",
    )
    (session_root / "auth.json").write_text("{}", encoding="utf-8")
    (session_root / "tmp" / "tmp.txt").write_text("tmp\n", encoding="utf-8")
    (session_root / "memories" / "memory.txt").write_text("memory\n", encoding="utf-8")

    assert [
        path.relative_to(session_root).as_posix()
        for path in module.iter_safe_session_source_paths(session_root)
    ] == [
        "config.toml",
        "log/listener.log",
        "log/nested/worker.log",
        "sessions/2026/04/09/a.jsonl",
        "sessions/2026/04/09/z.jsonl",
    ]


def test_build_external_agent_run_update_ignores_non_external_or_incomplete_payloads() -> (
    None
):
    module = load_collect_llm_artifacts_module()

    assert module.build_external_agent_run_update({"event": {}}) is None
    assert (
        module.build_external_agent_run_update(
            {
                "event": {
                    "detailJson": {
                        "messageType": "OtherEvent",
                        "content": {
                            "id": "run-123",
                            "inputs": {"runType": "external_agent"},
                        },
                    }
                }
            }
        )
        is None
    )
    assert (
        module.build_external_agent_run_update(
            {
                "event": {
                    "detailJson": {
                        "messageType": "AgentRunUpdated",
                        "content": {
                            "id": "   ",
                            "inputs": {"runType": "external_agent"},
                        },
                    }
                }
            }
        )
        is None
    )


def test_build_external_agent_run_update_normalizes_external_agent_payload() -> None:
    module = load_collect_llm_artifacts_module()

    assert module.build_external_agent_run_update(
        {
            "event": {
                "detailJson": {
                    "messageType": "AgentRunUpdated",
                    "content": {
                        "id": " run-123 ",
                        "inputs": {
                            "runType": " external_agent ",
                            "chatId": " chat-456 ",
                            "engineConfigId": " engine-789 ",
                        },
                        "outputs": ["not-a-dict"],
                    },
                }
            }
        }
    ) == {
        "runId": "run-123",
        "chatId": "chat-456",
        "engineConfigId": "engine-789",
        "threadId": "",
    }


def test_chrome_repro_collect_llm_artifacts_merges_external_agent_run_updates(
    tmp_path: Path,
) -> None:
    root = repo_root()
    artifact_dir = tmp_path / "recording"
    setta_files_root = tmp_path / "setta_files"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    setta_files_root.mkdir(parents=True, exist_ok=True)

    transport_detail_lines = [
        "{not json}",
        json.dumps(
            {
                "event": {
                    "detailJson": {
                        "messageType": "AgentRunUpdated",
                        "content": {
                            "id": "run-merged",
                            "inputs": {
                                "runType": "external_agent",
                                "engineConfigId": "engine-123",
                            },
                        },
                    }
                }
            }
        ),
        json.dumps(
            {
                "event": {
                    "detailJson": {
                        "messageType": "AgentRunUpdated",
                        "content": {
                            "id": "ignored-non-external",
                            "inputs": {
                                "runType": "internal_agent",
                                "chatId": "chat-ignored",
                            },
                        },
                    }
                }
            }
        ),
        json.dumps(
            {
                "event": {
                    "detailJson": {
                        "messageType": "AgentRunUpdated",
                        "content": {
                            "id": "run-merged",
                            "inputs": {
                                "runType": " external_agent ",
                                "chatId": "chat-456",
                            },
                            "outputs": {
                                "threadId": "thread-789",
                            },
                        },
                    }
                }
            }
        ),
    ]
    (artifact_dir / "transport_details.ndjson").write_text(
        "\n".join(transport_detail_lines) + "\n",
        encoding="utf-8",
    )

    process = subprocess.run(
        [
            sys.executable,
            str(root / "scripts" / "chrome_repro_collect_llm_artifacts.py"),
            "--artifact-dir",
            str(artifact_dir),
            "--setta-files-root",
            str(setta_files_root),
        ],
        cwd=root,
        check=False,
        capture_output=True,
        text=True,
    )

    assert process.returncode == 0, process.stdout + process.stderr

    manifest = json.loads(
        (artifact_dir / "llm_engine_artifacts" / "manifest.json").read_text(
            encoding="utf-8"
        )
    )

    assert manifest["recordedRuns"] == [
        {
            "runId": "run-merged",
            "chatId": "chat-456",
            "engineConfigId": "engine-123",
            "threadId": "thread-789",
        }
    ]
    assert manifest["copiedRunCount"] == 1
    assert manifest["copiedRuns"][0]["runId"] == "run-merged"
    assert manifest["copiedRuns"][0]["chatId"] == "chat-456"
    assert manifest["copiedRuns"][0]["threadId"] == "thread-789"
    assert (
        str(setta_files_root / "agent_runs" / "run-merged.json")
        == manifest["copiedRuns"][0]["missingRunFile"]
    )
