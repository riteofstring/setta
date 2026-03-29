import json
import shutil
import subprocess
import textwrap
from pathlib import Path

import pytest


def _resolve_node_command() -> str:
    bundled_root = (
        Path(__file__).resolve().parents[2] / "backend" / "setta" / "vendor" / "node"
    )
    for candidate in (
        bundled_root / "darwin-arm64" / "node",
        bundled_root / "darwin-x64" / "node",
        bundled_root / "linux-arm64" / "node",
        bundled_root / "linux-x64" / "node",
        bundled_root / "win-arm64" / "node.exe",
        bundled_root / "win-x64" / "node.exe",
    ):
        if candidate.exists():
            return str(candidate)
    return "node"


class TestOpenCodeQuestionReply:
    def _run_node(self, script: str) -> list:
        node_command = _resolve_node_command()
        node_path = shutil.which(node_command) or (
            node_command if Path(node_command).exists() else None
        )
        if node_path is None:
            pytest.fail(
                "node executable not found; ensure it is installed and on PATH."
            )
        result = subprocess.run(
            [node_path, "--input-type=module", "-e", script],
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            output = result.stderr.strip() or result.stdout.strip()
            pytest.fail(f"node script failed: {output}")
        output = result.stdout.strip()
        if not output:
            return []
        return json.loads(output)

    def test_string_answers_builds_answer_body(self) -> None:
        module_path = (
            Path(__file__).resolve().parents[2]
            / "backend"
            / "setta"
            / "agentic"
            / "external_adapters"
            / "sidecars"
            / "opencode_question_reply.mjs"
        )
        script = textwrap.dedent(
            """
            import { buildQuestionReplyBodies } from "__MODULE_URI__";
            const bodies = buildQuestionReplyBodies("Yes", null);
            console.log(JSON.stringify(bodies));
            """
        ).replace("__MODULE_URI__", module_path.as_uri())
        bodies = self._run_node(script)
        assert {"answers": [["Yes"]]} in bodies

    def test_array_answers_include_ordered_body(self) -> None:
        module_path = (
            Path(__file__).resolve().parents[2]
            / "backend"
            / "setta"
            / "agentic"
            / "external_adapters"
            / "sidecars"
            / "opencode_question_reply.mjs"
        )
        script = textwrap.dedent(
            """
            import { buildQuestionReplyBodies } from "__MODULE_URI__";
            const bodies = buildQuestionReplyBodies(["A", "B"], null);
            console.log(JSON.stringify(bodies));
            """
        ).replace("__MODULE_URI__", module_path.as_uri())
        bodies = self._run_node(script)
        assert {"answers": [["A"], ["B"]]} in bodies

    def test_object_answers_respects_question_order(self) -> None:
        module_path = (
            Path(__file__).resolve().parents[2]
            / "backend"
            / "setta"
            / "agentic"
            / "external_adapters"
            / "sidecars"
            / "opencode_question_reply.mjs"
        )
        script = textwrap.dedent(
            """
            import { buildQuestionReplyBodies } from "__MODULE_URI__";
            const rawAnswers = { "Q1": "One", "Q2": "Two" };
            const bodies = buildQuestionReplyBodies(rawAnswers, ["Q2", "Q1"]);
            console.log(JSON.stringify(bodies));
            """
        ).replace("__MODULE_URI__", module_path.as_uri())
        bodies = self._run_node(script)
        assert {"answers": [["Two"], ["One"]]} in bodies
