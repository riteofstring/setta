import json
import shutil
import subprocess
import textwrap
from pathlib import Path

import pytest
from setta.agentic.node_runtime import resolve_node_command


class TestOpenCodeQuestionMap:
    def test_resolves_question_id_from_tool_call(self) -> None:
        node_command = resolve_node_command(None)
        node_path = shutil.which(node_command) or (
            node_command if Path(node_command).exists() else None
        )
        if node_path is None:
            pytest.fail(
                "node executable not found; ensure it is installed and on PATH."
            )

        module_path = (
            Path(__file__).resolve().parents[2]
            / "backend"
            / "setta"
            / "agentic"
            / "external_adapters"
            / "sidecars"
            / "opencode_question_map.mjs"
        )
        if not module_path.exists():
            pytest.fail("opencode_question_map.mjs not found")

        event = {
            "type": "question.asked",
            "properties": {
                "id": "que-123",
                "tool": {"callID": "call-123"},
                "questions": [
                    {"question": "First question?"},
                    {"question": "Second question?"},
                ],
            },
        }
        payloads = {
            "by_tool_call": {"toolCallId": "call-123"},
            "direct_question": {"questionId": "que-direct"},
            "missing_mapping": {"toolCallId": "call-missing"},
            "fallback_id": {"id": "call-123"},
        }
        script = textwrap.dedent(
            """
            import assert from "node:assert/strict";
            import { createQuestionIdMapper } from "__MODULE_URI__";
            const { recordQuestionMapping, resolveQuestionId, resolveQuestionOrder } = createQuestionIdMapper();
            const event = __EVENT__;
            recordQuestionMapping(event);
            assert.equal(resolveQuestionId(__PAYLOAD_BY_TOOL_CALL__), "que-123");
            assert.equal(resolveQuestionId(__PAYLOAD_DIRECT__), "que-direct");
            assert.equal(resolveQuestionId(__PAYLOAD_MISSING__), "call-missing");
            assert.equal(resolveQuestionId(__PAYLOAD_FALLBACK__), "que-123");
            assert.deepEqual(
              resolveQuestionOrder(__PAYLOAD_BY_TOOL_CALL__),
              ["First question?", "Second question?"],
            );
            """
        )
        script = (
            script.replace("__MODULE_URI__", module_path.as_uri())
            .replace("__EVENT__", json.dumps(event))
            .replace("__PAYLOAD_BY_TOOL_CALL__", json.dumps(payloads["by_tool_call"]))
            .replace("__PAYLOAD_DIRECT__", json.dumps(payloads["direct_question"]))
            .replace("__PAYLOAD_MISSING__", json.dumps(payloads["missing_mapping"]))
            .replace("__PAYLOAD_FALLBACK__", json.dumps(payloads["fallback_id"]))
        )
        result = subprocess.run(
            [node_path, "--input-type=module", "-e", script],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            output = result.stderr.strip() or result.stdout.strip()
            pytest.fail(f"node script failed: {output}")
